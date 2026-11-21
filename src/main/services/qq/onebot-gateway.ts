import { createServer, type Server } from 'node:http';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import type { Logger } from '../../util/logger';

export interface OneBotEvent {
  post_type?: string;
  message_type?: string;
  sub_type?: string;
  self_id?: number;
  group_id?: number;
  user_id?: number;
  message_id?: number;
  raw_message?: string;
  message?: unknown;
  time?: number;
  sender?: { user_id?: number; nickname?: string; card?: string };
  [key: string]: unknown;
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export interface OneBotGatewayOptions {
  port: number;
  accessToken: string;
  logger: Logger;
  requestTimeoutMs?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 12_000;
const HEARTBEAT_MS = 30_000;

/**
 * 本机 OneBot 11 反向 WebSocket 服务端。
 * SnowLuma / NapCat 在「网络配置」里把反向 WS 指向 ws://127.0.0.1:<port>/ws 即可。
 */
export class OneBotGateway {
  private server: Server | null = null;
  private wss: WebSocketServer | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private readonly sockets = new Set<WebSocket>();
  private readonly pending = new Map<string, PendingCall>();
  private sequence = 0;
  private handler: ((event: OneBotEvent) => void) | null = null;
  private readonly requestTimeoutMs: number;

  constructor(private readonly options: OneBotGatewayOptions) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  get online(): boolean {
    return this.sockets.size > 0;
  }

  get listenUrl(): string {
    return `ws://127.0.0.1:${this.options.port}/ws`;
  }

  /** 实际监听端口，端口写 0 时由系统分配，冒烟测试会用到。 */
  get boundPort(): number {
    const address = this.server?.address();
    return typeof address === 'object' && address ? address.port : this.options.port;
  }

  onEvent(handler: (event: OneBotEvent) => void): void {
    this.handler = handler;
  }

  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    const server = createServer((_request, response) => {
      response.writeHead(426, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('这里是胡桃桌宠的 OneBot 反向 WebSocket 端点，请用 ws:// 连接。');
    });

    const wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
      if (!this.isAuthorized(request)) {
        this.options.logger.warn('QQ 反向 WS 连接被拒绝：token 不匹配');
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (client) => {
        wss.emit('connection', client, request);
      });
    });

    wss.on('connection', (client) => {
      this.sockets.add(client);
      this.options.logger.info('QQ 协议端已连接', { url: this.listenUrl, total: this.sockets.size });

      client.on('message', (data) => this.handleMessage(data));
      client.on('close', () => {
        this.sockets.delete(client);
        this.options.logger.info('QQ 协议端断开', { total: this.sockets.size });
      });
      client.on('error', (error) => {
        this.options.logger.warn('QQ 反向 WS 出错', error instanceof Error ? error.message : error);
      });
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (error: NodeJS.ErrnoException): void => {
        if (error.code === 'EADDRINUSE') {
          reject(new Error(`端口 ${this.options.port} 已被占用，换一个端口再试。`));
        } else {
          reject(error);
        }
      };

      server.once('error', onError);
      server.listen(this.options.port, '127.0.0.1', () => {
        server.off('error', onError);
        resolve();
      });
    });

    this.server = server;
    this.wss = wss;
    this.heartbeat = setInterval(() => {
      for (const client of this.sockets) {
        if (client.readyState === client.OPEN) {
          try {
            client.ping();
          } catch {
            // 单条连接 ping 失败不影响其它连接。
          }
        }
      }
    }, HEARTBEAT_MS);
    this.heartbeat.unref?.();
  }

  async stop(): Promise<void> {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }

    for (const [, call] of this.pending) {
      clearTimeout(call.timer);
      call.reject(new Error('OneBot 连接已关闭。'));
    }
    this.pending.clear();

    for (const client of this.sockets) {
      try {
        client.close();
      } catch {
        // 忽略关闭失败。
      }
    }
    this.sockets.clear();

    const wss = this.wss;
    const server = this.server;
    this.wss = null;
    this.server = null;

    await new Promise<void>((resolve) => {
      if (wss) {
        wss.close(() => resolve());
      } else {
        resolve();
      }
    });

    await new Promise<void>((resolve) => {
      if (server) {
        server.close(() => resolve());
        server.closeAllConnections?.();
      } else {
        resolve();
      }
    });
  }

  /** 调 OneBot API，按 echo 匹配响应。 */
  async call<T = unknown>(action: string, params: Record<string, unknown> = {}): Promise<T> {
    const client = this.pickSocket();
    if (!client) {
      throw new Error('QQ 协议端还没连上，先把 SnowLuma 开起来。');
    }

    const echo = `hutao-${Date.now()}-${(this.sequence += 1)}`;
    const payload = JSON.stringify({ action, params, echo });

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(echo);
        reject(new Error(`OneBot 调用 ${action} 超时。`));
      }, this.requestTimeoutMs);

      this.pending.set(echo, {
        resolve: (value) => resolve(value as T),
        reject,
        timer
      });

      client.send(payload, (error) => {
        if (error) {
          clearTimeout(timer);
          this.pending.delete(echo);
          reject(new Error(`OneBot 发送失败：${error.message}`));
        }
      });
    });
  }

  private pickSocket(): WebSocket | null {
    for (const client of this.sockets) {
      if (client.readyState === client.OPEN) {
        return client;
      }
    }
    return null;
  }

  private isAuthorized(request: { headers: { authorization?: string }; url?: string }): boolean {
    const token = this.options.accessToken.trim();
    if (!token) {
      return true;
    }

    const authorization = request.headers.authorization ?? '';
    if (authorization === `Bearer ${token}` || authorization === `Token ${token}` || authorization === token) {
      return true;
    }

    const query = request.url && request.url.includes('?') ? new URLSearchParams(request.url.split('?')[1]) : null;
    return query?.get('access_token') === token;
  }

  private handleMessage(data: RawData): void {
    const text = typeof data === 'string' ? data : data.toString();
    if (!text.trim()) {
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      this.options.logger.warn('QQ 反向 WS 收到非 JSON 数据');
      return;
    }

    if (!payload || typeof payload !== 'object') {
      return;
    }

    const record = payload as Record<string, unknown>;
    const echo = typeof record.echo === 'string' ? record.echo : null;

    if (echo) {
      const call = this.pending.get(echo);
      if (call) {
        this.pending.delete(echo);
        clearTimeout(call.timer);
        const status = typeof record.status === 'string' ? record.status : 'ok';
        if (status === 'failed' || record.retcode !== 0 && record.retcode !== 1 && record.retcode !== 100) {
          const message = typeof record.wording === 'string' ? record.wording : 'OneBot 调用失败。';
          call.reject(new Error(message));
        } else {
          call.resolve(record.data ?? null);
        }
      }
      return;
    }

    if (typeof record.post_type === 'string') {
      this.handler?.(record as OneBotEvent);
    }
  }
}
