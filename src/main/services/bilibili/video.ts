import type { BilibiliVideo } from '../../../shared';

const BV_PATTERN = /^BV[0-9A-Za-z]{10}$/;
const BILIBILI_VIDEO_BASE_URL = 'https://www.bilibili.com/video';
const ALLOWED_IMAGE_SUFFIXES = ['hdslb.com', 'biliimg.com'];
const TITLE_LIMIT = 140;
const MAX_VIDEO_DURATION_SECONDS = 24 * 60 * 60;

export function isBilibiliBvId(value: unknown): value is string {
  return typeof value === 'string' && BV_PATTERN.test(value);
}

export function getBilibiliVideoUrl(bvid: string): string {
  return `${BILIBILI_VIDEO_BASE_URL}/${bvid}`;
}

export function isAllowedBilibiliImageUrl(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return false;
    }

    const host = url.hostname.toLowerCase();
    return ALLOWED_IMAGE_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  } catch {
    return false;
  }
}

export function toSecureBilibiliImageUrl(value: unknown): string | null {
  if (!isAllowedBilibiliImageUrl(value)) {
    return null;
  }

  return value.replace(/^http:\/\//i, 'https://');
}

export function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

export function cleanBilibiliText(value: unknown, limit: number): string {
  if (typeof value !== 'string') {
    return '';
  }

  const text = decodeBasicHtmlEntities(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text.slice(0, limit);
}

function toFiniteNumber(value: unknown): number {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : 0;
}

function toPublishedIso(value: unknown): string | null {
  if (typeof value === 'string') {
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
  }

  const seconds = toFiniteNumber(value);
  if (seconds <= 0) {
    return null;
  }

  const date = new Date(seconds * 1000);
  const year = date.getFullYear();
  if (year < 2000 || year > 2100) {
    return null;
  }

  return date.toISOString();
}

function pickFirstNumber(...values: unknown[]): number {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return toFiniteNumber(value);
    }
  }

  return 0;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

/**
 * 把 B 站各种接口返回的原始稿件归一化成渲染层可用的结构。
 * 同时兼容已经归一化过的对象（历史记录回读时需要），任何字段缺失都会退化为空值。
 */
export function normalizeBilibiliVideo(raw: unknown): BilibiliVideo | null {
  const record = getRecord(raw);
  if (!record) {
    return null;
  }

  const bvid = typeof record.bvid === 'string' ? record.bvid : '';
  if (!isBilibiliBvId(bvid)) {
    return null;
  }

  const title = cleanBilibiliText(record.title, TITLE_LIMIT);
  if (!title) {
    return null;
  }

  const owner = getRecord(record.owner);
  const stat = getRecord(record.stat);
  const upName = cleanBilibiliText(record.upName ?? owner?.name, 40) || '未知 UP 主';
  const durationSeconds = Math.round(pickFirstNumber(record.durationSeconds, record.duration));
  const viewCount = Math.max(0, Math.round(pickFirstNumber(record.viewCount, stat?.view)));
  const danmakuCount = Math.max(
    0,
    Math.round(pickFirstNumber(record.danmakuCount, stat?.danmaku, record.video_review))
  );
  const coverUrl = toSecureBilibiliImageUrl(record.coverUrl ?? record.pic) ?? '';
  const category = cleanBilibiliText(record.category ?? record.tname, 20) || '综合';
  const publishedAt = toPublishedIso(record.publishedAt ?? record.pubdate ?? record.ctime);

  if (durationSeconds <= 0 || durationSeconds > MAX_VIDEO_DURATION_SECONDS) {
    return null;
  }

  return {
    bvid,
    title,
    upName,
    coverUrl,
    durationSeconds,
    viewCount,
    danmakuCount,
    publishedAt,
    category,
    url: getBilibiliVideoUrl(bvid)
  };
}

export function parseBilibiliVideoList(payload: unknown): BilibiliVideo[] {
  const root = getRecord(payload);
  if (!root) {
    return [];
  }

  if (root.code !== undefined && Number(root.code) !== 0) {
    return [];
  }

  const data = getRecord(root.data);
  const list = Array.isArray(data?.list) ? data.list : Array.isArray(data?.archives) ? data.archives : [];

  return list
    .map((item) => normalizeBilibiliVideo(item))
    .filter((video): video is BilibiliVideo => video !== null);
}

export function parseBilibiliVideoDetail(payload: unknown): BilibiliVideo | null {
  const root = getRecord(payload);
  if (!root || (root.code !== undefined && Number(root.code) !== 0)) {
    return null;
  }

  return normalizeBilibiliVideo(root.data);
}
