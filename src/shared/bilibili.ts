export interface BilibiliSettings {
  /** 是否允许胡桃自己定时去 B 站逛并分享。 */
  enabled: boolean;
  /** 两次自动分享之间的基础间隔（分钟）。 */
  shareIntervalMinutes: number;
  /** 安静时段内不主动打扰，手动「去逛逛」仍然可用。 */
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  /** 每天最多主动分享几条，避免刷屏。 */
  dailyShareLimit: number;
  /** 兴趣关键词，前端面板里用逗号分隔编辑。 */
  interests: string[];
  /** 是否接受 20 分钟以上的长视频。 */
  allowLongVideos: boolean;
  /** 配置了 MiniMax 时，让胡桃用 AI 现写一句推荐语。 */
  aiCommentary: boolean;
}

export type BilibiliSettingsPatch = Partial<BilibiliSettings>;

export interface BilibiliVideo {
  bvid: string;
  title: string;
  upName: string;
  coverUrl: string;
  durationSeconds: number;
  viewCount: number;
  danmakuCount: number;
  /** ISO 时间；解析失败时为 null。 */
  publishedAt: string | null;
  category: string;
  url: string;
}

export type BilibiliShareMood = 'curious' | 'happy' | 'proud';
export type BilibiliShareSource = 'auto' | 'manual';

export interface BilibiliShare {
  /** 分享记录 id，等于 bvid。 */
  id: string;
  video: BilibiliVideo;
  /** 气泡里显示的短句。 */
  message: string;
  /** 卡片上显示的推荐理由，例如「热门 · 鬼畜 · 184.3万播放」。 */
  reason: string;
  mood: BilibiliShareMood;
  source: BilibiliShareSource;
  sharedAt: string;
}

export type BilibiliFeedbackAction = 'like' | 'dislike';

export interface BilibiliFeedbackRequest {
  bvid: string;
  action: BilibiliFeedbackAction;
}

export interface BilibiliBrowseRequest {
  source: BilibiliShareSource;
  /** 换一个时传入当前稿件，避免重复。 */
  excludeBvid?: string;
}

export interface BilibiliBrowseResult {
  ok: boolean;
  message: string;
  share?: BilibiliShare;
  error?: string;
}

export interface BilibiliCoverResult {
  ok: boolean;
  bvid: string;
  dataUrl?: string;
  error?: string;
}

export interface BilibiliBrowsingEvent {
  source: BilibiliShareSource;
}

export interface BilibiliStatus {
  settings: BilibiliSettings;
  browsing: boolean;
  lastShareAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
  todayShared: number;
  totalShared: number;
  seenCount: number;
  recentShares: BilibiliShare[];
}

export const MIN_BILIBILI_INTERVAL_MINUTES = 15;
export const MAX_BILIBILI_INTERVAL_MINUTES = 360;
export const MAX_BILIBILI_DAILY_SHARES = 24;
export const MAX_BILIBILI_INTERESTS = 12;
export const MAX_BILIBILI_INTEREST_LENGTH = 12;

export const DEFAULT_BILIBILI_INTERESTS: string[] = [
  '原神',
  '胡桃',
  '搞笑',
  '整活',
  '鬼畜',
  '萌宠',
  '美食',
  '音乐',
  '动画',
  '科技'
];

export const DEFAULT_BILIBILI_SETTINGS: BilibiliSettings = {
  enabled: true,
  shareIntervalMinutes: 75,
  quietHoursEnabled: true,
  quietHoursStart: '00:30',
  quietHoursEnd: '07:30',
  dailyShareLimit: 8,
  interests: DEFAULT_BILIBILI_INTERESTS,
  allowLongVideos: false,
  aiCommentary: true
};

/** 首次自动逛站的延迟范围，让桌宠启动后先安静一会儿。 */
export const BILIBILI_INITIAL_DELAY_MS = { min: 90_000, max: 240_000 };

export function parseClockToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

export function formatMinutesToClock(totalMinutes: number): string {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function isWithinQuietHours(minutesOfDay: number, start: string, end: string): boolean {
  const startMinutes = parseClockToMinutes(start);
  const endMinutes = parseClockToMinutes(end);

  if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) {
    return false;
  }

  if (startMinutes < endMinutes) {
    return minutesOfDay >= startMinutes && minutesOfDay < endMinutes;
  }

  return minutesOfDay >= startMinutes || minutesOfDay < endMinutes;
}
