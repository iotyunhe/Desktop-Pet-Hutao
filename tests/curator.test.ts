import assert from 'node:assert/strict';
import test from 'node:test';
import type { BilibiliVideo } from '../src/shared/bilibili';
import {
  ContentCurator,
  isBlockedTitle,
  isEligibleVideo,
  scoreVideo,
  type CuratorContext
} from '../src/main/services/bilibili/content-curator';

function makeVideo(overrides: Partial<BilibiliVideo> = {}): BilibiliVideo {
  return {
    bvid: 'BV1xx411c7mD',
    title: '胡桃带来的快乐整活',
    upName: '往生堂',
    coverUrl: '',
    durationSeconds: 180,
    viewCount: 50_000,
    danmakuCount: 30,
    publishedAt: new Date().toISOString(),
    category: '鬼畜',
    url: 'https://www.bilibili.com/video/BV1xx411c7mD',
    ...overrides
  };
}

function makeContext(overrides: Partial<CuratorContext> = {}): CuratorContext {
  return {
    interests: ['原神', '搞笑'],
    allowLongVideos: false,
    seenBvids: new Set<string>(),
    dislikedBvids: new Set<string>(),
    dislikedUpNames: [],
    likedUpNames: [],
    recentUpNames: [],
    recentCategories: [],
    ...overrides
  };
}

test('isBlockedTitle 过滤掉广告与让人不适的标题', () => {
  assert.equal(isBlockedTitle('这期是纯恰饭广告'), true);
  assert.equal(isBlockedTitle('深夜恐怖故事合集'), true);
  assert.equal(isBlockedTitle('胡桃在 B 站整活实录'), false);
});

test('isEligibleVideo 处理看过、点踩、时长与播放量', () => {
  const context = makeContext();

  assert.equal(isEligibleVideo(makeVideo(), context), true);
  assert.equal(isEligibleVideo(makeVideo({ durationSeconds: 20 }), context), false);
  assert.equal(isEligibleVideo(makeVideo({ durationSeconds: 1500 }), context), false);
  assert.equal(isEligibleVideo(makeVideo({ durationSeconds: 1500 }), makeContext({ allowLongVideos: true })), true);
  assert.equal(isEligibleVideo(makeVideo({ viewCount: 100 }), context), false);
  assert.equal(isEligibleVideo(makeVideo(), makeContext({ seenBvids: new Set(['BV1xx411c7mD']) })), false);
  assert.equal(isEligibleVideo(makeVideo(), makeContext({ dislikedUpNames: ['往生堂'] })), false);
});

test('scoreVideo 给兴趣命中与最近重复 UP 不同权重', () => {
  const context = makeContext({ interests: ['原神'] });
  const noJitter = () => 0;
  const matched = scoreVideo(makeVideo({ title: '原神胡桃小剧场' }), context, noJitter);
  const unmatched = scoreVideo(makeVideo({ title: '普通日常记录' }), context, noJitter);

  assert.ok(matched.score > unmatched.score);
  assert.deepEqual(matched.matchedInterests, ['原神']);

  const repeated = scoreVideo(makeVideo(), makeContext({ recentUpNames: ['往生堂'] }), noJitter);
  const fresh = scoreVideo(makeVideo(), makeContext(), noJitter);
  assert.ok(repeated.score < fresh.score);
});

test('ContentCurator 优先挑高分候选，并排除看过与点踩', () => {
  const curator = new ContentCurator(() => 0);
  const interestVideo = makeVideo({
    bvid: 'BV1aa411c7mD',
    title: '原神整活名场面',
    viewCount: 800_000
  });
  const plainVideo = makeVideo({
    bvid: 'BV1bb411c7mD',
    title: '随手拍的一段日常',
    upName: '路人',
    viewCount: 30_000,
    category: '生活'
  });

  const pick = curator.pick([plainVideo, interestVideo], makeContext());
  assert.equal(pick?.video.bvid, 'BV1aa411c7mD');

  const seenPick = curator.pick(
    [plainVideo, interestVideo],
    makeContext({ seenBvids: new Set(['BV1aa411c7mD']) })
  );
  assert.equal(seenPick?.video.bvid, 'BV1bb411c7mD');

  assert.equal(curator.pick([], makeContext()), null);
  assert.equal(curator.pick([plainVideo], makeContext({ dislikedBvids: new Set(['BV1bb411c7mD']) })), null);
});

test('ContentCurator 在候选前列里按偏置随机挑选', () => {
  const videos = [
    makeVideo({ bvid: 'BV1aa411c7mD', title: '原神第一', viewCount: 900_000 }),
    makeVideo({ bvid: 'BV1bb411c7mD', title: '原神第二', viewCount: 700_000 }),
    makeVideo({ bvid: 'BV1cc411c7mD', title: '原神第三', viewCount: 500_000 })
  ];

  const first = new ContentCurator(() => 0).pick(videos, makeContext());
  const later = new ContentCurator(() => 0.99).pick(videos, makeContext());
  assert.notEqual(first?.video.bvid, later?.video.bvid);
});
