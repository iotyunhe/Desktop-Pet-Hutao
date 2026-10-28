import type { BilibiliVideo } from '../../../shared/bilibili';
import { formatViewCount } from '../../../shared/format';

export interface CuratorContext {
  interests: string[];
  allowLongVideos: boolean;
  seenBvids: ReadonlySet<string>;
  dislikedBvids: ReadonlySet<string>;
  dislikedUpNames: string[];
  likedUpNames: string[];
  recentUpNames: string[];
  recentCategories: string[];
}

export interface CuratedPick {
  video: BilibiliVideo;
  score: number;
  matchedInterests: string[];
  reason: string;
}

/** 容易让人不开心的标题关键词，直接排除，保证「好看好玩」的基调。 */
export const BLOCKED_TITLE_KEYWORDS = [
  '广告',
  '恰饭',
  '推广',
  '带货',
  '课程',
  '引流',
  '加群',
  '恐怖',
  '惊悚',
  '血腥',
  '擦边',
  '低俗',
  '引战',
  '吃瓜',
  '塌房',
  '去世',
  '讣告',
  '自杀',
  '赌博',
  '贷款',
  '医美',
  '减肥药',
  '网暴',
  '对线',
  '吵架',
  '骗局'
];

export const CATEGORY_AFFINITY: Record<string, number> = {
  鬼畜: 24,
  鬼畜剧场: 24,
  搞笑: 22,
  动物: 20,
  美食: 18,
  美食制作: 18,
  音乐: 18,
  音乐综合: 16,
  动画: 16,
  国产动画: 16,
  游戏: 14,
  手机游戏: 14,
  单机游戏: 14,
  科技: 14,
  数码: 12,
  手工: 12,
  舞蹈: 10,
  生活: 10,
  影视: 10,
  影视杂谈: 10,
  知识: 8,
  运动: 8
};

export const CURATOR_DURATION_LIMITS = {
  minSeconds: 45,
  maxSeconds: 1200,
  maxLongSeconds: 3600,
  minViewCount: 2000
} as const;

export function isBlockedTitle(title: string): boolean {
  const normalized = title.toLowerCase();
  return BLOCKED_TITLE_KEYWORDS.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

export function findMatchedInterests(video: BilibiliVideo, interests: string[]): string[] {
  const haystack = `${video.title} ${video.category} ${video.upName}`.toLowerCase();

  return interests
    .map((interest) => interest.trim())
    .filter((interest) => interest.length > 0 && haystack.includes(interest.toLowerCase()))
    .slice(0, 3);
}

export function buildCuratedReason(video: BilibiliVideo, matchedInterests: string[]): string {
  const parts: string[] = [];

  if (matchedInterests.length > 0) {
    parts.push(`「${matchedInterests[0]}」相关`);
  } else {
    parts.push('热门推荐');
  }

  parts.push(video.category);
  parts.push(`${formatViewCount(video.viewCount)}播放`);

  return parts.join(' · ');
}

export function scoreVideo(
  video: BilibiliVideo,
  context: CuratorContext,
  random: () => number = Math.random
): { score: number; matchedInterests: string[] } {
  const matchedInterests = findMatchedInterests(video, context.interests);
  let score = 20;

  if (matchedInterests.length > 0) {
    score += 28 + Math.min(2, matchedInterests.length - 1) * 12;
  }

  score += CATEGORY_AFFINITY[video.category] ?? 4;

  const viewScore = Math.min(32, Math.log10(Math.max(video.viewCount, 10)) * 4);
  score += viewScore;

  if (video.durationSeconds >= 90 && video.durationSeconds <= 900) {
    score += 10;
  } else {
    score += 5;
  }

  if (video.publishedAt) {
    const ageHours = (Date.now() - Date.parse(video.publishedAt)) / 3_600_000;
    if (ageHours >= 0 && ageHours < 48) {
      score += 8;
    } else if (ageHours >= 0 && ageHours < 24 * 7) {
      score += 4;
    }
  }

  if (context.likedUpNames.includes(video.upName)) {
    score += 15;
  }

  if (context.recentUpNames.includes(video.upName)) {
    score -= 45;
  }

  if (context.recentCategories[0] === video.category) {
    score -= 12;
  }

  score += random() * 16;
  return { score, matchedInterests };
}

export function isEligibleVideo(video: BilibiliVideo, context: CuratorContext): boolean {
  const { minSeconds, maxSeconds, maxLongSeconds, minViewCount } = CURATOR_DURATION_LIMITS;
  const maxDuration = context.allowLongVideos ? maxLongSeconds : maxSeconds;

  if (context.seenBvids.has(video.bvid) || context.dislikedBvids.has(video.bvid)) {
    return false;
  }

  if (context.dislikedUpNames.includes(video.upName)) {
    return false;
  }

  if (video.durationSeconds < minSeconds || video.durationSeconds > maxDuration) {
    return false;
  }

  if (video.viewCount < minViewCount) {
    return false;
  }

  return !isBlockedTitle(video.title);
}

/**
 * 从候选池里挑一条：先过滤，再打分，最后在候选前列里按偏置随机挑，
 * 既保证质量，又不会每次都是同一条热门。
 */
export class ContentCurator {
  constructor(private readonly random: () => number = Math.random) {}

  pick(videos: BilibiliVideo[], context: CuratorContext): CuratedPick | null {
    const scored = videos
      .filter((video) => isEligibleVideo(video, context))
      .map((video) => {
        const { score, matchedInterests } = scoreVideo(video, context, this.random);
        return {
          video,
          score,
          matchedInterests,
          reason: buildCuratedReason(video, matchedInterests)
        };
      })
      .sort((left, right) => right.score - left.score);

    if (scored.length === 0) {
      return null;
    }

    const topCount = Math.min(4, scored.length);
    const biasedIndex = Math.min(topCount - 1, Math.floor(Math.pow(this.random(), 1.8) * topCount));
    return scored[biasedIndex];
  }
}
