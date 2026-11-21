import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  WORKBENCH_PORT_ATTEMPTS,
  type AccessPolicy,
  type AccessStatus
} from '../../shared/access';
import type { QqSettingsPatch, QqStatus } from '../../shared/qq';
import type { LocalAccessService } from '../services/access/local-access-service';
import type { QqService } from '../services/qq/qq-service';
import type { AiService } from '../services/ai/ai-service';
import type { Logger } from '../util/logger';

export interface WorkbenchDependencies {
  access: LocalAccessService;
  qq: QqService;
  ai: AiService;
  logger: Logger;
  appVersion: string;
  /** 页面文件在开发/打包两种环境下的真实位置。 */
  findPageFile: () => string | null;
  onPolicyChanged?: (policy: AccessPolicy) => void;
  browseBilibili?: () => void;
}

interface ActionRequest {
  action?: string;
  payload?: Record<string, unknown>;
}

const MAX_BODY_BYTES = 32 * 1024;
const MAX_AUDIT_ITEMS = 80;

/**
 * 胡桃工作台：只在本机 127.0.0.1 上起的一个小 HTTP 服务，带 token。
 * 页面本身不含任何逻辑黑魔法，全部操作都落到 LocalAccessService 上，权限照旧受策略约束。
 */
export class WorkbenchServer {
  private server: Server | null = null;
  private boundPort: number | null = null;
  private readonly tokens = new Set<string>();
  private pageCache: string | null = null;

  constructor(private readonly options: WorkbenchDependencies) {}

  get port(): number | null {
    return this.boundPort;
  }

  get running(): boolean {
    return this.server !== null;
  }

  /** 带 token 的访问地址；工作台没起来时返回 null。 */
  url(): string | null {
    const token = this.options.access.ensureToken().workbenchToken;
    if (!this.boundPort || !token) {
      return null;
    }

    return `http://127.0.0.1:${this.boundPort}/?t=${token}`;
  }

  async start(): Promise<string | null> {
    if (this.server) {
      return this.url();
    }

    const policy = this.options.access.getPolicy();
    const preferred = policy.workbenchPort;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < WORKBENCH_PORT_ATTEMPTS; attempt += 1) {
      const port = attempt === 0 ? preferred : 0;
      try {
        await this.listenOn(port);
        this.boundPort = this.resolvePort();
        this.options.logger.info('胡桃工作台已启动', { port: this.boundPort });
        return this.url();
      } catch (error) {
        lastError = error;
        if (isPortBusy(error)) {
          continue;
        }
        break;
      }
    }

    this.options.logger.warn(
      '胡桃工作台启动失败',
      lastError instanceof Error ? lastError.message : String(lastError)
    );
    return null;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.boundPort = null;
    if (!server) {
      return;
    }

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  private listenOn(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = createServer((request, response) => {
        void this.handle(request, response);
      });

      server.once('error', (error) => {
        reject(error);
      });

      server.listen(port, '127.0.0.1', () => {
        server.removeAllListeners('error');
        server.on('error', (error) => {
          this.options.logger.warn('工作台服务出错', error instanceof Error ? error.message : String(error));
        });
        this.server = server;
        resolve();
      });
    });
  }

  private resolvePort(): number {
    const address = this.server?.address();
    if (address && typeof address === 'object') {
      return address.port;
    }
    return 0;
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');

    if (url.pathname === '/' || url.pathname === '/index.html') {
      const token = url.searchParams.get('t') ?? '';
      if (!this.checkToken(token)) {
        sendText(response, 401, '工作台 token 不对，回桌宠里重新打开一次。');
        return;
      }

      const page = this.loadPage();
      if (!page) {
        sendText(response, 500, '找不到工作台页面文件。');
        return;
      }

      this.tokens.add(token);
      sendHtml(response, page);
      return;
    }

    if (!url.pathname.startsWith('/api/')) {
      sendText(response, 404, '没有了。');
      return;
    }

    if (!this.checkToken(headerToken(request) ?? url.searchParams.get('t') ?? '')) {
      sendJson(response, 401, { ok: false, message: 'token 无效。' });
      return;
    }

    try {
      if (request.method === 'GET' && url.pathname === '/api/status') {
        sendJson(response, 200, this.buildStatus());
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/audit') {
        const limit = Math.min(MAX_AUDIT_ITEMS, Number(url.searchParams.get('limit') ?? 40) || 40);
        const status = this.options.access.getStatus();
        sendJson(response, 200, { ok: true, audit: status.audit.slice(0, limit) });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/action') {
        const body = await readJsonBody(request);
        const result = await this.runAction(body);
        sendJson(response, 200, result);
        return;
      }

      sendJson(response, 404, { ok: false, message: '没有这个接口。' });
    } catch (error) {
      this.options.logger.warn(
        '工作台请求失败',
        error instanceof Error ? error.message : String(error)
      );
      sendJson(response, 500, { ok: false, message: '工作台内部错误。' });
    }
  }

  private buildStatus(): Record<string, unknown> {
    const access = this.options.access;
    const status: AccessStatus = access.getStatus();
    const qq: QqStatus = this.options.qq.getStatus();
    const aiStatus = this.options.ai.getStatus();

    return {
      ok: true,
      app: { version: this.options.appVersion },
      access: {
        policy: status.policy,
        pending: status.pending,
        opsLastHour: status.opsLastHour,
        audit: status.audit.slice(0, 20)
      },
      qq: {
        state: qq.state,
        botNickname: qq.botNickname,
        selfQq: qq.settings.selfQq,
        allowedGroups: qq.settings.allowedGroups,
        adminQqs: qq.settings.adminQqs,
        todayReplies: qq.todayReplies,
        groups: qq.groups,
        recentReplies: qq.recentReplies.slice(0, 6),
        lastError: qq.lastError
      },
      ai: {
        enabled: aiStatus.settings.enabled,
        hasApiKey: aiStatus.hasApiKey,
        keySource: aiStatus.keySource,
        model: aiStatus.settings.textModel,
        baseUrl: aiStatus.settings.apiBaseUrl,
        lastError: aiStatus.lastError
      }
    };
  }

  private async runAction(request: ActionRequest): Promise<Record<string, unknown>> {
    const action = typeof request.action === 'string' ? request.action : '';
    const payload = isRecord(request.payload) ? request.payload : {};
    const access = this.options.access;
    const actor = 'workbench';

    switch (action) {
      case 'read-file': {
        const result = access.readTextFile(stringOf(payload.path), actor);
        return toResult(result, (data) => ({ path: data.path, content: data.content, bytes: data.bytes }));
      }
      case 'list-dir': {
        const result = access.listDirectory(stringOf(payload.path), actor);
        return toResult(result, (data) => ({ path: data.path, entries: data.entries }));
      }
      case 'screenshot': {
        const result = await access.screenshot(actor);
        return toResult(result, (data) => ({ mimeType: data.mimeType, base64: data.base64 }));
      }
      case 'launch': {
        const result = await access.launch(stringOf(payload.id), actor);
        return toResult(result, (data) => data);
      }
      case 'request-command': {
        const result = access.requestCommand(stringOf(payload.command), actor);
        return toResult(result, (data) => ({ id: data.id, expiresAt: data.expiresAt }));
      }
      case 'approve': {
        const result = await access.approve(stringOf(payload.id), actor);
        return toResult(result, (data) => data);
      }
      case 'deny': {
        const denied = access.deny(stringOf(payload.id), actor);
        return { ok: denied, message: denied ? '已经拒绝了。' : '这条申请已经不在了。' };
      }
      case 'save-policy': {
        const patch = isRecord(payload.patch) ? (payload.patch as Partial<AccessPolicy>) : {};
        const policy = access.updatePolicy(patch);
        this.options.onPolicyChanged?.(policy);
        return { ok: true, message: '权限已保存。', data: { policy } };
      }
      case 'refresh-qq-groups': {
        const groups = await this.options.qq.refreshGroups();
        return { ok: true, message: `读到 ${groups.length} 个群。`, data: { groups } };
      }
      case 'save-qq': {
        const patch = isRecord(payload.patch) ? (payload.patch as QqSettingsPatch) : {};
        const status = await this.options.qq.updateSettings(patch);
        return { ok: true, message: 'QQ 设置已保存。', data: { status } };
      }
      case 'browse-bilibili': {
        this.options.browseBilibili?.();
        return { ok: true, message: '让她去逛 B 站了。' };
      }
      case 'clear-audit': {
        access.clearAudit();
        return { ok: true, message: '审计记录已清空。' };
      }
      default:
        return { ok: false, message: `不认识的 action：${action || '(空)'}` };
    }
  }

  private checkToken(token: string): boolean {
    if (!token) {
      return false;
    }

    const expected = this.options.access.ensureToken().workbenchToken;
    return Boolean(expected) && token === expected;
  }

  private loadPage(): string | null {
    if (this.pageCache !== null) {
      return this.pageCache;
    }

    const file = this.options.findPageFile();
    if (!file) {
      return null;
    }

    try {
      this.pageCache = readFileSync(file, 'utf8');
      return this.pageCache;
    } catch (error) {
      this.options.logger.warn(
        '读不到工作台页面',
        error instanceof Error ? error.message : String(error)
      );
      return null;
    }
  }
}

function toResult<T>(
  result: { ok: boolean; reason?: string; message?: string; data?: T },
  map: (data: T) => unknown
): Record<string, unknown> {
  if (!result.ok) {
    return { ok: false, reason: result.reason, message: result.message };
  }

  return { ok: true, message: result.message, data: result.data ? map(result.data) : undefined };
}

function headerToken(request: IncomingMessage): string | null {
  const header = request.headers['x-hutao-token'];
  if (typeof header === 'string' && header) {
    return header;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isPortBusy(error: unknown): boolean {
  return isRecord(error) && error.code === 'EADDRINUSE';
}

function readJsonBody(request: IncomingMessage): Promise<ActionRequest> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];

    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('请求体太大'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }

      try {
        const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(isRecord(parsed) ? (parsed as ActionRequest) : {});
      } catch (error) {
        reject(error instanceof Error ? error : new Error('请求体不是合法 JSON'));
      }
    });

    request.on('error', reject);
  });
}

function sendText(response: ServerResponse, status: number, text: string): void {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(text);
}

function sendHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(html);
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(JSON.stringify(body));
}

/** 页面文件位置：开发时在仓库 tools 下，打包后在 resources/workbench 下。 */
export function resolveWorkbenchPage(
  appPath: string,
  resourcesPath: string,
  packaged: boolean
): string {
  return packaged
    ? join(resourcesPath, 'workbench', 'index.html')
    : join(appPath, 'tools', 'hutao-workbench', 'index.html');
}
