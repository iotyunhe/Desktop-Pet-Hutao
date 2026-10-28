import { appendFileSync, mkdirSync, statSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';

const MAX_LOG_BYTES = 1_000_000;

let logFilePath: string | null = null;

export interface Logger {
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, error?: unknown): void;
}

function stringifyData(data: unknown): string {
  if (data === undefined) {
    return '';
  }

  if (data instanceof Error) {
    return ` ${data.name}: ${data.message}`;
  }

  try {
    return ` ${JSON.stringify(data)}`;
  } catch {
    return ' [unserializable]';
  }
}

function rotateIfNeeded(): void {
  if (!logFilePath) {
    return;
  }

  try {
    if (statSync(logFilePath).size > MAX_LOG_BYTES) {
      renameSync(logFilePath, `${logFilePath}.1`);
    }
  } catch {
    // 文件还不存在，忽略。
  }
}

function writeLine(level: string, message: string, data?: unknown): void {
  const line = `[${new Date().toISOString()}] [${level}] ${message}${stringifyData(data)}\n`;

  if (level === 'ERROR') {
    console.error(line.trimEnd());
  } else {
    console.log(line.trimEnd());
  }

  if (!logFilePath) {
    return;
  }

  try {
    mkdirSync(dirname(logFilePath), { recursive: true });
    rotateIfNeeded();
    appendFileSync(logFilePath, line, 'utf8');
  } catch {
    // 日志失败不能影响桌宠本体。
  }
}

export function createLogger(userDataDir: string): Logger {
  logFilePath = join(userDataDir, 'logs', 'app.log');

  return {
    info: (message, data) => writeLine('INFO', message, data),
    warn: (message, data) => writeLine('WARN', message, data),
    error: (message, error) => writeLine('ERROR', message, error)
  };
}

export const noopLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};
