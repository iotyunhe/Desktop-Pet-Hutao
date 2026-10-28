import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_BILIBILI_HISTORY, normalizeBilibiliHistory } from '../src/main/storage/bilibili-history';

const VIDEO = {
  bvid: 'BV1xx411c7mD',
  title: '胡桃测试视频',
  pic: 'http://i0.hdslb.com/a.jpg',
  duration: 180,
  pubdate: 1_700_000_000,
  owner: { name: '往生堂' },
  stat: { view: 12345, danmaku: 10 },
  tname: '鬼畜'
};

const SHARE = {
  id: 'BV1xx411c7mD',
  video: VIDEO,
  message: '本堂主逛到个宝贝',
  reason: '热门推荐 · 鬼畜 · 1.2万播放',
  mood: 'happy',
  source: 'auto',
  sharedAt: '2026-10-27T02:00:00.000Z'
};

test('normalizeBilibiliHistory 过滤非法记录并去重', () => {
  const history = normalizeBilibiliHistory({
    seenBvids: ['BV1xx411c7mD', 'BV1xx411c7mD', 'bad', 'BV1yy411c7mD'],
    shares: [SHARE, { video: { bvid: 'bad' } }, { message: 'no video' }],
    likedUpNames: ['往生堂', '往生堂', '  '],
    dislikedBvids: ['BV1zz411c7mD', 'nope'],
    lastShareAt: '2026-10-27T02:00:00.000Z',
    dailyCountDate: '2026-10-27',
    dailyCount: 3,
    totalShared: 9
  });

  assert.deepEqual(history.seenBvids, ['BV1xx411c7mD', 'BV1yy411c7mD']);
  assert.equal(history.shares.length, 1);
  assert.equal(history.shares[0].mood, 'happy');
  assert.deepEqual(history.likedUpNames, ['往生堂']);
  assert.deepEqual(history.dislikedBvids, ['BV1zz411c7mD']);
  assert.equal(history.dailyCount, 3);
  assert.equal(history.totalShared, 9);
});

test('normalizeBilibiliHistory 对空值回退默认', () => {
  assert.deepEqual(normalizeBilibiliHistory(null), DEFAULT_BILIBILI_HISTORY);
  assert.deepEqual(normalizeBilibiliHistory({}), DEFAULT_BILIBILI_HISTORY);
});

test('normalizeBilibiliHistory 修正非法日期与计数', () => {
  const history = normalizeBilibiliHistory({
    dailyCountDate: '2026/10/27',
    dailyCount: -5,
    totalShared: 'abc',
    lastShareAt: 'not-a-date'
  });

  assert.equal(history.dailyCountDate, null);
  assert.equal(history.dailyCount, 0);
  assert.equal(history.totalShared, 0);
  assert.equal(history.lastShareAt, null);
});
