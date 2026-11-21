import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { safeStorage } from 'electron';
import { normalizeAiSettings } from '../../shared/normalize';
import type { AiSettings } from '../../shared/ai';
import { JsonStore } from './json-store';

export class AiSettingsStore extends JsonStore<AiSettings> {
  constructor(userDataDir: string) {
    super({
      filePath: () => join(userDataDir, 'ai-settings.json'),
      defaults: () => normalizeAiSettings(null),
      normalize: (value) => normalizeAiSettings(value)
    });
  }
}

export type LlmKeySource = 'stored' | 'environment';

/** 这些环境变量都能当 Key 用，按优先级从前往后取。 */
export const LLM_KEY_ENV_NAMES = ['HUTAO_API_KEY', 'OPENCODE_API_KEY', 'DEEPSEEK_API_KEY'] as const;

/**
 * 大模型 API Key：面板里保存的（safeStorage 加密）优先，
 * 没有就用环境变量，方便「在 OpenCode / DeepSeek 里已经配过」的人直接跑起来。
 */
export class LlmKeyStore {
  constructor(
    private readonly userDataDir: () => string,
    private readonly env: NodeJS.ProcessEnv = process.env
  ) {}

  private filePath(): string {
    return join(this.userDataDir(), 'llm-api-key.bin');
  }

  /** 0.4.x 及更早版本存的是 MiniMax 专用文件，读一次做平滑迁移。 */
  private legacyFilePath(): string {
    return join(this.userDataDir(), 'minimax-api-key.bin');
  }

  isEncryptionAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  }

  readEnv(): string | null {
    for (const name of LLM_KEY_ENV_NAMES) {
      const value = this.env[name];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return null;
  }

  readStored(): string | null {
    const path = this.filePath();
    const legacyPath = this.legacyFilePath();
    const target = existsSync(path) ? path : existsSync(legacyPath) ? legacyPath : null;

    if (!target || !this.isEncryptionAvailable()) {
      return null;
    }

    try {
      const decrypted = safeStorage.decryptString(readFileSync(target));
      const trimmed = decrypted.trim();
      if (!trimmed) {
        return null;
      }

      if (target === legacyPath) {
        this.save(trimmed);
      }

      return trimmed;
    } catch {
      return null;
    }
  }

  read(): string | null {
    return this.readStored() ?? this.readEnv();
  }

  source(): LlmKeySource | null {
    if (this.readStored()) {
      return 'stored';
    }
    return this.readEnv() ? 'environment' : null;
  }

  save(key: string): boolean {
    const trimmed = key.trim();
    if (!trimmed || !this.isEncryptionAvailable()) {
      return false;
    }

    try {
      const path = this.filePath();
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, safeStorage.encryptString(trimmed));
      return true;
    } catch {
      return false;
    }
  }

  clear(): void {
    for (const path of [this.filePath(), this.legacyFilePath()]) {
      try {
        if (existsSync(path)) {
          unlinkSync(path);
        }
      } catch {
        // 清理失败不阻塞流程。
      }
    }
  }
}
