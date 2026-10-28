import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { safeStorage } from 'electron';
import type { AiSettings } from '../../shared/ai';
import { DEFAULT_AI_SETTINGS } from '../../shared/ai';
import { normalizeAiSettings } from '../../shared/normalize';
import { JsonStore } from './json-store';

export class AiSettingsStore extends JsonStore<AiSettings> {
  constructor(userDataDir: string) {
    super({
      filePath: () => join(userDataDir, 'ai-settings.json'),
      defaults: () => ({ ...DEFAULT_AI_SETTINGS }),
      normalize: normalizeAiSettings
    });
  }
}

/**
 * MiniMax API Key 走 Electron safeStorage 加密落盘，明文永远不写磁盘。
 */
export class MiniMaxKeyStore {
  private readonly filePath: string;

  constructor(userDataDir: string) {
    this.filePath = join(userDataDir, 'minimax-api-key.bin');
  }

  isEncryptionAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  read(): string | null {
    if (!this.isEncryptionAvailable() || !existsSync(this.filePath)) {
      return null;
    }

    try {
      const key = safeStorage.decryptString(readFileSync(this.filePath)).trim();
      return key || null;
    } catch {
      return null;
    }
  }

  save(key: string): boolean {
    const nextKey = key.trim();
    if (!nextKey || !this.isEncryptionAvailable()) {
      return false;
    }

    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, safeStorage.encryptString(nextKey));
    return true;
  }

  clear(): void {
    if (existsSync(this.filePath)) {
      unlinkSync(this.filePath);
    }
  }
}
