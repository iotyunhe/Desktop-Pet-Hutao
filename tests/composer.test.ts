import assert from 'node:assert/strict';
import test from 'node:test';
import type { BilibiliVideo } from '../src/shared/bilibili';
import { composeBrowseFailureLine, composeShare, SHARE_MESSAGE_LIMIT } from '../src/main/services/bilibili/share-composer';
import { formatDuration, formatViewCount, truncateText } from '../src/shared/format';

const video: BilibiliVideo = {
  bvid: 'BV1xx411c7mD',
  title: '一个非常非常长的视频标题用来验证气泡文案不会无限膨胀的情况',
  upName: '往生堂',
  coverUrl: 'https://i0.hdslb.com/x.jpg',
  durationSeconds: 190,
  viewCount: 1_234_567,
  danmakuCount: 100,
  publishedAt: new Date().toISOString(),
  category: '鬼畜',
  url: 'https://www.bilibili.com/video/BV1xx411c7mD'
};

test('composeShare 生成带书名号的短句且长度受限', () => {
  const share = composeShare(video, {
    matchedInterests: [],
    reason: '热门推荐 · 鬼畜 · 123.5万播放',
    random: () => 0
  });

  assert.equal(share.mood, 'curious');
  assert.ok(share.message.includes('《'));
  assert.ok(share.message.length <= SHARE_MESSAGE_LIMIT);
});

test('composeShare 的打油诗模板只使用短标题', () => {
  const share = composeShare(video, {
    matchedInterests: [],
    reason: '热门推荐',
    random: () => 0.79
  });

  assert.ok(share.message.includes('桌面逛小站'));
  assert.ok(share.message.length <= SHARE_MESSAGE_LIMIT);
});

test('composeShare 不会给已经带书名号的标题再套一层', () => {
  const share = composeShare(
    { ...video, title: '《纯阳真气》完整版' },
    {
      matchedInterests: [],
      reason: '热门推荐',
      random: () => 0.2
    }
  );

  assert.ok(!share.message.includes('《《'));
  assert.ok(share.message.includes('《纯阳真气'));
});

test('composeBrowseFailureLine 三态文案', () => {
  assert.match(composeBrowseFailureLine('offline'), /连不上/);
  assert.match(composeBrowseFailureLine('no-match'), /没挑到/);
  assert.match(composeBrowseFailureLine('error'), /晚点/);
});

test('formatViewCount / formatDuration / truncateText', () => {
  assert.equal(formatViewCount(999), '999');
  assert.equal(formatViewCount(12_345), '1.2万');
  assert.equal(formatViewCount(123_456_789), '1.2亿');
  assert.equal(formatViewCount(0), '0');
  assert.equal(formatDuration(190), '3:10');
  assert.equal(formatDuration(3725), '1:02:05');
  assert.equal(truncateText('一二三四五', 3), '一二…');
  assert.equal(truncateText('短', 3), '短');
});
