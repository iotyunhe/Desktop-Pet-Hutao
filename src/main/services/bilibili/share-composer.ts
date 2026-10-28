import type { BilibiliShareMood, BilibiliVideo } from '../../../shared/bilibili';
import { formatViewCount, truncateText } from '../../../shared/format';

export interface ComposeContext {
  matchedInterests: string[];
  reason: string;
  random?: () => number;
}

export interface ComposedShare {
  message: string;
  mood: BilibiliShareMood;
}

export const SHARE_MESSAGE_LIMIT = 72;

const SHARE_MOODS: BilibiliShareMood[] = ['curious', 'happy', 'proud'];

export type BrowseFailureKind = 'offline' | 'no-match' | 'error';

const FAILURE_LINES: Record<BrowseFailureKind, string> = {
  offline: 'B 站那边好像连不上，本堂主先回来守着你。',
  'no-match': '本堂主在 B 站转了一圈，今天没挑到合眼缘的，过会儿再去。',
  error: 'B 站门口今天有点挤，本堂主晚点再去逛。'
};

function formatShareTitle(title: string): string {
  // 标题本身已经带书名号时不再重复套一层，气泡里会更清爽。
  return truncateText(title.replace(/[《》]/g, ''), 24);
}

export function composeShare(video: BilibiliVideo, context: ComposeContext): ComposedShare {
  const random = context.random ?? Math.random;
  const title = formatShareTitle(video.title);
  const shortTitle = truncateText(title, 14);
  const upName = truncateText(video.upName, 12);
  const views = formatViewCount(video.viewCount);

  const templates: string[] = [
    `本堂主在B站逛到个宝贝：《${title}》，${upName}整的活，${views}播放呢！`,
    `刚溜达到B站，《${title}》看着就好玩，${video.category}区的，赏个脸？`,
    `来来来，《${title}》——${upName}出手，${context.reason}，本堂主准你喜欢。`,
    `桌面逛小站，${shortTitle}正新鲜；${upName}这支小片，赏脸看个两三遍。`,
    `发现个乐子：《${title}》，${upName}干的，${video.category}区已经热闹起来啦。`
  ];

  const templateIndex = Math.min(templates.length - 1, Math.floor(random() * templates.length));
  const moodIndex = Math.min(SHARE_MOODS.length - 1, Math.floor(random() * SHARE_MOODS.length));

  return {
    message: truncateText(templates[templateIndex], SHARE_MESSAGE_LIMIT),
    mood: SHARE_MOODS[moodIndex]
  };
}

export function composeBrowseFailureLine(kind: BrowseFailureKind): string {
  return FAILURE_LINES[kind];
}
