import type { BilibiliShare, BilibiliShareMood, BilibiliShareSource } from '../../shared/bilibili';
import { isBilibiliBvId, normalizeBilibiliVideo } from '../services/bilibili/video';

export interface BilibiliHistory {
  /** 最近看过的稿件，最新在前，用于去重。 */
  seenBvids: string[];
  /** 最近分享过的稿件，最新在前。 */
  shares: BilibiliShare[];
  likedUpNames: string[];
  dislikedUpNames: string[];
  dislikedBvids: string[];
  lastShareAt: string | null;
  lastRunAt: string | null;
  dailyCountDate: string | null;
  dailyCount: number;
  totalShared: number;
}

export const BILIBILI_HISTORY_LIMITS = {
  seen: 400,
  shares: 30,
  upNames: 50
} as const;

export const DEFAULT_BILIBILI_HISTORY: BilibiliHistory = {
  seenBvids: [],
  shares: [],
  likedUpNames: [],
  dislikedUpNames: [],
  dislikedBvids: [],
  lastShareAt: null,
  lastRunAt: null,
  dailyCountDate: null,
  dailyCount: 0,
  totalShared: 0
};

const SHARE_MOODS: BilibiliShareMood[] = ['curious', 'happy', 'proud'];
const SHARE_SOURCES: BilibiliShareSource[] = ['auto', 'manual'];

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function normalizeStringList(value: unknown, limit: number, isValid?: (item: string) => boolean): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const items: string[] = [];

  for (const item of value) {
    if (typeof item !== 'string') {
      continue;
    }

    const next = item.trim();
    if (!next || seen.has(next) || (isValid && !isValid(next))) {
      continue;
    }

    seen.add(next);
    items.push(next);

    if (items.length >= limit) {
      break;
    }
  }

  return items;
}

function normalizeIsoString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

export function normalizeBilibiliShare(value: unknown): BilibiliShare | null {
  const record = getRecord(value);
  if (!record) {
    return null;
  }

  const video = normalizeBilibiliVideo(record.video);
  if (!video) {
    return null;
  }

  const message = typeof record.message === 'string' ? record.message.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
  const reason = typeof record.reason === 'string' ? record.reason.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  const mood = SHARE_MOODS.includes(record.mood as BilibiliShareMood) ? (record.mood as BilibiliShareMood) : 'curious';
  const source = SHARE_SOURCES.includes(record.source as BilibiliShareSource)
    ? (record.source as BilibiliShareSource)
    : 'manual';
  const sharedAt = normalizeIsoString(record.sharedAt) ?? new Date(0).toISOString();

  return {
    id: video.bvid,
    video,
    message: message || video.title,
    reason,
    mood,
    source,
    sharedAt
  };
}

export function normalizeBilibiliHistory(value: unknown): BilibiliHistory {
  const record = getRecord(value);

  if (!record) {
    return { ...DEFAULT_BILIBILI_HISTORY };
  }

  const seenBvids = normalizeStringList(record.seenBvids, BILIBILI_HISTORY_LIMITS.seen, isBilibiliBvId);
  const shares = Array.isArray(record.shares)
    ? record.shares
        .map((share) => normalizeBilibiliShare(share))
        .filter((share): share is BilibiliShare => share !== null)
        .slice(0, BILIBILI_HISTORY_LIMITS.shares)
    : [];
  const dailyCount = Math.max(0, Math.min(100, Math.round(Number(record.dailyCount) || 0)));
  const totalShared = Math.max(0, Math.round(Number(record.totalShared) || 0));

  return {
    seenBvids,
    shares,
    likedUpNames: normalizeStringList(record.likedUpNames, BILIBILI_HISTORY_LIMITS.upNames),
    dislikedUpNames: normalizeStringList(record.dislikedUpNames, BILIBILI_HISTORY_LIMITS.upNames),
    dislikedBvids: normalizeStringList(record.dislikedBvids, BILIBILI_HISTORY_LIMITS.seen, isBilibiliBvId),
    lastShareAt: normalizeIsoString(record.lastShareAt),
    lastRunAt: normalizeIsoString(record.lastRunAt),
    dailyCountDate: typeof record.dailyCountDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(record.dailyCountDate)
      ? record.dailyCountDate
      : null,
    dailyCount,
    totalShared
  };
}
