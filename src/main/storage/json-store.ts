import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface JsonStoreOptions<T> {
  /** 延迟取路径，保证 electron app 就绪后再解析 userData。 */
  filePath: () => string;
  defaults: () => T;
  normalize: (value: unknown) => T;
}

/**
 * 单文件 JSON 持久化：读取时归一化、写入时先写临时文件再原子替换。
 * 桌宠的 settings / profile / ai / bilibili 都复用这一套，避免重复的读写代码。
 */
export class JsonStore<T> {
  private state: T;

  constructor(private readonly options: JsonStoreOptions<T>) {
    this.state = options.defaults();
  }

  load(): T {
    const filePath = this.options.filePath();

    if (!existsSync(filePath)) {
      this.state = this.options.normalize(this.options.defaults());
      this.persist();
      return this.state;
    }

    try {
      const raw = readFileSync(filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      const normalized = this.options.normalize(parsed);
      this.state = normalized;

      if (JSON.stringify(normalized) !== JSON.stringify(parsed)) {
        this.persist();
      }
    } catch {
      this.state = this.options.normalize(this.options.defaults());
      this.persist();
    }

    return this.state;
  }

  get(): T {
    return this.state;
  }

  replace(value: T): T {
    this.state = this.options.normalize(value);
    this.persist();
    return this.state;
  }

  update(patch: Partial<T>): T {
    this.state = this.options.normalize({ ...this.state, ...patch });
    this.persist();
    return this.state;
  }

  private persist(): void {
    const filePath = this.options.filePath();
    const contents = `${JSON.stringify(this.state, null, 2)}\n`;
    mkdirSync(dirname(filePath), { recursive: true });

    const tempPath = `${filePath}.${process.pid}.tmp`;
    try {
      writeFileSync(tempPath, contents, 'utf8');
      renameSync(tempPath, filePath);
    } catch {
      // rename 在个别文件系统上可能失败，退化为直接写入。
      writeFileSync(filePath, contents, 'utf8');
      try {
        if (existsSync(tempPath)) {
          unlinkSync(tempPath);
        }
      } catch {
        // 忽略清理失败。
      }
    }
  }
}
