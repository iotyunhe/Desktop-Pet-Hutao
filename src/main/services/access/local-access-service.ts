import { execFile } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  ACCESS_APPROVAL_TTL_MS,
  ACCESS_AUDIT_FILE_LIMIT,
  ACCESS_AUDIT_MEMORY_LIMIT,
  ACCESS_OPS_WINDOW_MS,
  ACCESS_PENDING_LIMIT,
  ACCESS_READ_EXTENSIONS,
  MAX_LIST_ENTRIES,
  MAX_READ_BYTES,
  MAX_SHELL_OUTPUT,
  type AccessAuditEntry,
  type AccessCommandResult,
  type AccessDenyReason,
  type AccessListing,
  type AccessPendingEntry,
  type AccessPolicy,
  type AccessReadResult,
  type AccessResult,
  type AccessScreenshot,
  type AccessStatus
} from '../../../shared/access';
import { normalizeAccessPolicy } from '../../../shared/normalize';
import type { Logger } from '../../util/logger';

export interface ShellResult {
  exitCode: number;
  output: string;
  truncated: boolean;
}

export interface LocalAccessOptions {
  /** 当前策略的读取/写入入口，由 store 提供。 */
  getPolicy: () => AccessPolicy;
  savePolicy: (next: AccessPolicy) => AccessPolicy;
  userDataDir: string;
  logger: Logger;
  /** 截图实现由主进程注入（要用 Electron 的 desktopCapturer），测试里可以传假实现。 */
  captureScreen?: () => Promise<AccessScreenshot | null>;
  openPath?: (target: string) => Promise<string>;
  openExternal?: (url: string) => Promise<void>;
  runShell?: (command: string, timeoutMs: number) => Promise<ShellResult>;
  /** 策略或待审批列表变化时通知上层刷新界面。 */
  onChange?: () => void;
  now?: () => number;
}

interface PendingApproval extends AccessPendingEntry {
  command: string;
}

function fail<T>(reason: AccessDenyReason, message: string): AccessResult<T> {
  return { ok: false, reason, message };
}

function done<T>(data: T): AccessResult<T> {
  return { ok: true, data };
}

function isInside(root: string, target: string): boolean {
  const relativePath = relative(root, target);
  return relativePath === '' || (!relativePath.startsWith('..') && !relativePath.includes(`..${sep}`) && !/^[a-zA-Z]:/.test(relativePath));
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 「有限地访问电脑」的执行者：所有能力都要过策略、路径守卫、限流和审计。
 * 这里没有写文件、删文件的接口，需要动文件的场景只能走需要审批的命令。
 */
export class LocalAccessService {
  private readonly now: () => number;
  private readonly pending = new Map<string, PendingApproval>();
  private readonly opTimes: number[] = [];
  private audit: AccessAuditEntry[] = [];
  private readonly auditPath: string;

  constructor(private readonly options: LocalAccessOptions) {
    this.now = options.now ?? (() => Date.now());
    this.auditPath = join(options.userDataDir, 'access-audit.jsonl');
    this.audit = this.readAuditTail();
  }

  getPolicy(): AccessPolicy {
    return this.options.getPolicy();
  }

  getStatus(): AccessStatus {
    this.pruneApprovals();
    return {
      policy: this.getPolicy(),
      pending: [...this.pending.values()].map(({ command: _command, ...entry }) => entry),
      audit: this.audit.slice(-ACCESS_AUDIT_MEMORY_LIMIT),
      opsLastHour: this.countRecentOps()
    };
  }

  updatePolicy(patch: Partial<AccessPolicy>): AccessPolicy {
    const next = normalizeAccessPolicy({ ...this.getPolicy(), ...patch });
    if (!next.workbenchToken) {
      next.workbenchToken = this.createToken();
    }

    const saved = this.options.savePolicy(next);
    this.record('panel', 'policy-update', 'access-settings.json', true);
    this.options.logger.info('本地权限策略已更新', {
      enabled: saved.enabled,
      readRoots: saved.readRoots.length,
      launch: saved.launchAllowlist.length,
      shell: saved.allowShell
    });
    this.options.onChange?.();
    return saved;
  }

  ensureToken(): AccessPolicy {
    if (this.getPolicy().workbenchToken) {
      return this.getPolicy();
    }

    return this.updatePolicy({ workbenchToken: this.createToken() });
  }

  /** 只读：读白名单目录里的文本文件。 */
  readTextFile(target: string, actor = 'panel'): AccessResult<AccessReadResult> {
    const policy = this.getPolicy();
    if (!policy.enabled || !policy.allowRead) {
      return this.refuse(actor, 'read', target, 'not-allowed', '主人还没有打开「读取白名单目录」。');
    }

    if (policy.readRoots.length === 0) {
      return this.refuse(actor, 'read', target, 'not-allowed', '白名单目录还是空的。');
    }

    const limited = this.limit(actor, 'read', target);
    if (limited) {
      return limited;
    }

    const resolved = this.resolveReadable(target, policy.readRoots);
    if (!resolved.ok) {
      return this.refuse(actor, 'read', target, resolved.reason, resolved.message);
    }

    try {
      const stats = statSync(resolved.path);
      if (!stats.isFile()) {
        return this.refuse(actor, 'read', target, 'invalid', '这不是一个文件。');
      }

      const extension = extname(resolved.path).toLowerCase();
      if (!ACCESS_READ_EXTENSIONS.includes(extension)) {
        return this.refuse(actor, 'read', target, 'not-allowed', `只能读文本类文件，${extension || '未知类型'} 不在白名单里。`);
      }

      if (stats.size > MAX_READ_BYTES) {
        return this.refuse(actor, 'read', target, 'too-large', `文件有 ${Math.round(stats.size / 1024)}KB，超过 256KB 上限。`);
      }

      const buffer = readFileSync(resolved.path);
      if (buffer.includes(0)) {
        return this.refuse(actor, 'read', target, 'binary', '看起来是二进制文件，读不了。');
      }

      const content = buffer.toString('utf8');
      this.record(actor, 'read', resolved.path, true);
      return done({ path: resolved.path, content, bytes: buffer.byteLength, truncated: false });
    } catch (error) {
      return this.refuse(actor, 'read', target, 'not-found', `读不了这个文件：${describeError(error)}`);
    }
  }

  /** 只读：列白名单目录。 */
  listDirectory(target: string, actor = 'panel'): AccessResult<AccessListing> {
    const policy = this.getPolicy();
    if (!policy.enabled || !policy.allowRead) {
      return this.refuse(actor, 'list', target, 'not-allowed', '主人还没有打开「读取白名单目录」。');
    }

    const limited = this.limit(actor, 'list', target);
    if (limited) {
      return limited;
    }

    const resolved = this.resolveReadable(target, policy.readRoots);
    if (!resolved.ok) {
      return this.refuse(actor, 'list', target, resolved.reason, resolved.message);
    }

    try {
      const stats = statSync(resolved.path);
      if (!stats.isDirectory()) {
        return this.refuse(actor, 'list', target, 'invalid', '这是一个文件，不是目录。');
      }

      const entries = readdirSync(resolved.path, { withFileTypes: true })
        .slice(0, MAX_LIST_ENTRIES)
        .map((entry) => {
          let size = 0;
          try {
            size = statSync(join(resolved.path, entry.name)).size;
          } catch {
            size = 0;
          }

          return {
            name: entry.name,
            kind: entry.isDirectory() ? ('dir' as const) : ('file' as const),
            size
          };
        });

      this.record(actor, 'list', resolved.path, true);
      return done({ path: resolved.path, entries, truncated: entries.length >= MAX_LIST_ENTRIES });
    } catch (error) {
      return this.refuse(actor, 'list', target, 'not-found', `打不开这个目录：${describeError(error)}`);
    }
  }

  async screenshot(actor = 'panel'): Promise<AccessResult<AccessScreenshot>> {
    const policy = this.getPolicy();
    if (!policy.enabled || !policy.allowScreenshot) {
      return this.refuse(actor, 'screenshot', 'screen', 'not-allowed', '主人还没有打开「看屏幕截图」。');
    }

    if (!this.options.captureScreen) {
      return this.refuse(actor, 'screenshot', 'screen', 'not-allowed', '这个环境拿不到屏幕画面。');
    }

    const limited = this.limit(actor, 'screenshot', 'screen');
    if (limited) {
      return limited;
    }

    try {
      const shot = await this.options.captureScreen();
      if (!shot) {
        return this.refuse(actor, 'screenshot', 'screen', 'not-found', '没有截到画面（可能锁屏了）。');
      }

      this.record(actor, 'screenshot', `${shot.width}x${shot.height}`, true);
      return done(shot);
    } catch (error) {
      return this.refuse(actor, 'screenshot', 'screen', 'invalid', `截图失败：${describeError(error)}`);
    }
  }

  /** 打开白名单里的程序/文件/网址。 */
  async launch(id: string, actor = 'panel'): Promise<AccessResult<{ label: string; target: string }>> {
    const policy = this.getPolicy();
    if (!policy.enabled || !policy.allowLaunch) {
      return this.refuse(actor, 'launch', id, 'not-allowed', '主人还没有打开「打开程序/文件」。');
    }

    const entry =
      policy.launchAllowlist.find((item) => item.id === id) ??
      policy.launchAllowlist.find((item) => item.label === id) ??
      null;
    if (!entry) {
      return this.refuse(actor, 'launch', id, 'not-allowed', '这个程序不在白名单里。');
    }

    const limited = this.limit(actor, 'launch', entry.label);
    if (limited) {
      return limited;
    }

    try {
      if (entry.kind === 'url') {
        if (!this.options.openExternal) {
          return this.refuse(actor, 'launch', entry.label, 'not-allowed', '这个环境打不开网址。');
        }
        await this.options.openExternal(entry.target);
      } else {
        if (!this.options.openPath) {
          return this.refuse(actor, 'launch', entry.label, 'not-allowed', '这个环境打不开程序。');
        }
        const error = await this.options.openPath(entry.target);
        if (error) {
          return this.refuse(actor, 'launch', entry.label, 'invalid', error);
        }
      }

      this.record(actor, 'launch', entry.label, true);
      return done({ label: entry.label, target: entry.target });
    } catch (error) {
      return this.refuse(actor, 'launch', entry.label, 'invalid', `打不开：${describeError(error)}`);
    }
  }

  /** 命令永远不直接执行，先生成一条待审批记录。 */
  requestCommand(command: string, actor = 'panel'): AccessResult<AccessPendingEntry> {
    const policy = this.getPolicy();
    if (!policy.enabled || !policy.allowShell) {
      return this.refuse(actor, 'command', command, 'not-allowed', '主人还没有打开「执行命令」。');
    }

    const trimmed = command.trim();
    if (!trimmed || trimmed.length > 500) {
      return this.refuse(actor, 'command', command, 'invalid', '命令太长或为空。');
    }

    const limited = this.limit(actor, 'command', trimmed);
    if (limited) {
      return limited;
    }

    this.pruneApprovals();
    if (this.pending.size >= ACCESS_PENDING_LIMIT) {
      return this.refuse(actor, 'command', trimmed, 'rate-limited', '待确认的请求太多了，先去工作台处理一下。');
    }

    const createdAt = this.now();
    const id = randomBytes(6).toString('hex');
    const entry: PendingApproval = {
      id,
      action: 'command',
      target: trimmed,
      detail: '执行一条 PowerShell 命令',
      actor,
      createdAt: new Date(createdAt).toISOString(),
      expiresAt: new Date(createdAt + ACCESS_APPROVAL_TTL_MS).toISOString(),
      command: trimmed
    };

    this.pending.set(id, entry);
    this.record(actor, 'command-request', trimmed, true);
    this.options.onChange?.();
    return done(entry);
  }

  async approve(id: string, actor = 'panel'): Promise<AccessResult<AccessCommandResult>> {
    this.pruneApprovals();
    const entry = this.pending.get(id);
    if (!entry) {
      return this.refuse(actor, 'command-approve', id, 'expired', '这条请求已经过期或者不存在了。');
    }

    this.pending.delete(id);
    this.options.onChange?.();
    if (!this.options.runShell) {
      return this.refuse(actor, 'command', entry.target, 'not-allowed', '这个环境执行不了命令。');
    }

    const timeoutMs = this.getPolicy().shellTimeoutMs;
    const startedAt = this.now();
    try {
      const result = await this.options.runShell(entry.target, timeoutMs);
      const durationMs = this.now() - startedAt;
      this.record(actor, 'command', entry.target, true);
      return done({
        command: entry.target,
        exitCode: result.exitCode,
        output: result.output.slice(0, MAX_SHELL_OUTPUT),
        truncated: result.truncated || result.output.length > MAX_SHELL_OUTPUT,
        durationMs
      });
    } catch (error) {
      return this.refuse(actor, 'command', entry.target, 'invalid', `命令执行失败：${describeError(error)}`);
    }
  }

  deny(id: string, actor = 'panel'): boolean {
    const entry = this.pending.get(id);
    if (!entry) {
      return false;
    }

    this.pending.delete(id);
    this.record(actor, 'command-deny', entry.target, false, 'denied');
    this.options.onChange?.();
    return true;
  }

  clearAudit(): void {
    this.audit = [];
    try {
      if (existsSync(this.auditPath)) {
        renameSync(this.auditPath, `${this.auditPath}.old`);
      }
    } catch {
      // 清不掉就留着，不影响下次写入。
    }
    this.record('panel', 'audit-clear', this.auditPath, true);
    this.options.onChange?.();
  }

  getAuditPath(): string {
    return this.auditPath;
  }

  private resolveReadable(
    target: string,
    roots: string[]
  ): { ok: true; path: string } | { ok: false; reason: AccessDenyReason; message: string } {
    if (typeof target !== 'string' || !target.trim()) {
      return { ok: false, reason: 'invalid', message: '路径是空的。' };
    }

    try {
      const realTarget = realpathSync(resolve(target));
      for (const root of roots) {
        let realRoot: string;
        try {
          realRoot = realpathSync(resolve(root));
        } catch {
          continue;
        }

        if (isInside(realRoot, realTarget)) {
          return { ok: true, path: realTarget };
        }
      }

      return { ok: false, reason: 'path-outside', message: '这个路径不在主人给的白名单目录里。' };
    } catch {
      return { ok: false, reason: 'not-found', message: '找不到这个路径。' };
    }
  }

  private limit(actor: string, action: string, target: string): AccessResult<never> | null {
    const maxOps = this.getPolicy().maxOpsPerHour;
    if (this.countRecentOps() >= maxOps) {
      this.record(actor, action, target, false, 'rate-limited');
      return fail<never>('rate-limited', `一小时内最多 ${maxOps} 次本地操作，先歇一会儿。`);
    }

    this.opTimes.push(this.now());
    return null;
  }

  private countRecentOps(): number {
    const cutoff = this.now() - ACCESS_OPS_WINDOW_MS;
    while (this.opTimes.length > 0 && this.opTimes[0] < cutoff) {
      this.opTimes.shift();
    }
    return this.opTimes.length;
  }

  private refuse(
    actor: string,
    action: string,
    target: string,
    reason: AccessDenyReason,
    message: string
  ): AccessResult<never> {
    this.record(actor, action, target, false, reason);
    return fail<never>(reason, message);
  }

  private pruneApprovals(): void {
    const now = this.now();
    for (const [id, entry] of this.pending) {
      if (Date.parse(entry.expiresAt) <= now) {
        this.pending.delete(id);
        this.record(entry.actor, 'command-expired', entry.target, false, 'expired');
      }
    }
  }

  private record(actor: string, action: string, target: string, ok: boolean, reason?: string): void {
    const entry: AccessAuditEntry = {
      at: new Date(this.now()).toISOString(),
      actor,
      action,
      target: target.slice(0, 300),
      ok,
      ...(reason ? { reason } : {})
    };

    this.audit.push(entry);
    if (this.audit.length > ACCESS_AUDIT_MEMORY_LIMIT) {
      this.audit.splice(0, this.audit.length - ACCESS_AUDIT_MEMORY_LIMIT);
    }

    try {
      mkdirSync(dirname(this.auditPath), { recursive: true });
      if (existsSync(this.auditPath) && statSync(this.auditPath).size > ACCESS_AUDIT_FILE_LIMIT) {
        renameSync(this.auditPath, `${this.auditPath}.1`);
      }
      appendFileSync(this.auditPath, `${JSON.stringify(entry)}\n`, 'utf8');
    } catch (error) {
      this.options.logger.warn('写入权限审计失败', describeError(error));
    }
  }

  private readAuditTail(): AccessAuditEntry[] {
    try {
      if (!existsSync(this.auditPath)) {
        return [];
      }

      const lines = readFileSync(this.auditPath, 'utf8')
        .split('\n')
        .filter((line) => line.trim())
        .slice(-ACCESS_AUDIT_MEMORY_LIMIT);

      const entries: AccessAuditEntry[] = [];
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as Partial<AccessAuditEntry>;
          if (parsed && typeof parsed.at === 'string' && typeof parsed.action === 'string') {
            entries.push({
              at: parsed.at,
              actor: typeof parsed.actor === 'string' ? parsed.actor : 'unknown',
              action: parsed.action,
              target: typeof parsed.target === 'string' ? parsed.target : '',
              ok: Boolean(parsed.ok),
              ...(typeof parsed.reason === 'string' ? { reason: parsed.reason } : {})
            });
          }
        } catch {
          // 单行坏了就跳过。
        }
      }

      return entries;
    } catch {
      return [];
    }
  }

  private createToken(): string {
    return randomBytes(16).toString('hex');
  }
}
