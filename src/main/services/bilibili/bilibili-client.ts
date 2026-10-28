import type { BilibiliVideo } from '../../../shared/bilibili';
import {
  isAllowedBilibiliImageUrl,
  parseBilibiliVideoDetail,
  parseBilibiliVideoList,
  toSecureBilibiliImageUrl
} from './video';

export const BILIBILI_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
export const BILIBILI_REFERER = 'https://www.bilibili.com/';
export const BILIBILI_TIMEOUT_MS = 12_000;
export const MAX_COVER_BYTES = 2_000_000;

export interface BilibiliClientOptions {
  /** 可选 Cookie（例如 SESSDATA），只用于提高公共接口的稳定性，不落盘。 */
  cookie?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  userAgent?: string;
}

const VIDEO_PARTITIONS = ['4', '188'];

/**
 * 匿名访问 B 站公开 Web 接口：热门、排行、分区最新。
 * 不登录、不写 Cookie、不调用需要 WBI 签名的搜索接口。
 */
export class BilibiliClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly cookie: string | null;
  private readonly userAgent: string;

  constructor(options: BilibiliClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? BILIBILI_TIMEOUT_MS;
    this.cookie = options.cookie?.trim() || null;
    this.userAgent = options.userAgent ?? BILIBILI_USER_AGENT;
  }

  async fetchPopular(ps = 20, pn = 1): Promise<BilibiliVideo[]> {
    const payload = await this.requestJson(`x/web-interface/popular?ps=${ps}&pn=${pn}`);
    return parseBilibiliVideoList(payload);
  }

  async fetchRanking(rid = 0): Promise<BilibiliVideo[]> {
    const payload = await this.requestJson(`x/web-interface/ranking/v2?rid=${rid}&type=all`);
    return parseBilibiliVideoList(payload);
  }

  async fetchNewlist(rid: number, ps = 12): Promise<BilibiliVideo[]> {
    const payload = await this.requestJson(`x/web-interface/newlist?rid=${rid}&ps=${ps}&pn=1`);
    return parseBilibiliVideoList(payload);
  }

  /**
   * 汇总多个公开来源的候选稿件，按 bvid 去重。
   * 单个来源失败不影响其他来源，保证离线/限流时仍可能拿到内容。
   */
  async collectCandidates(): Promise<BilibiliVideo[]> {
    const tasks: Array<Promise<BilibiliVideo[]>> = [
      this.fetchPopular(20),
      this.fetchRanking(0),
      ...VIDEO_PARTITIONS.map((rid) => this.fetchNewlist(Number(rid)))
    ];

    const results = await Promise.allSettled(tasks);
    const videos = new Map<string, BilibiliVideo>();

    for (const result of results) {
      if (result.status !== 'fulfilled') {
        continue;
      }

      for (const video of result.value) {
        if (!videos.has(video.bvid)) {
          videos.set(video.bvid, video);
        }
      }
    }

    return [...videos.values()];
  }

  async fetchVideo(bvid: string): Promise<BilibiliVideo | null> {
    const payload = await this.requestJson(`x/web-interface/view?bvid=${encodeURIComponent(bvid)}`);
    return parseBilibiliVideoDetail(payload);
  }

  async fetchCoverDataUrl(coverUrl: string): Promise<string | null> {
    const secureUrl = toSecureBilibiliImageUrl(coverUrl);
    if (!secureUrl || !isAllowedBilibiliImageUrl(secureUrl)) {
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(secureUrl, {
        headers: this.buildHeaders(),
        signal: controller.signal
      });

      if (!response.ok) {
        return null;
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.startsWith('image/')) {
        return null;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength === 0 || buffer.byteLength > MAX_COVER_BYTES) {
        return null;
      }

      return `data:${contentType.split(';')[0]};base64,${buffer.toString('base64')}`;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': this.userAgent,
      Referer: BILIBILI_REFERER,
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      ...extra
    };

    if (this.cookie) {
      headers.Cookie = this.cookie;
    }

    return headers;
  }

  private async requestJson(path: string): Promise<unknown> {
    const url = path.startsWith('http') ? path : `https://api.bilibili.com/${path.replace(/^\/+/, '')}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        headers: this.buildHeaders(),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`B 站接口返回 HTTP ${response.status}`);
      }

      return (await response.json()) as unknown;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('B 站接口请求超时。');
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
