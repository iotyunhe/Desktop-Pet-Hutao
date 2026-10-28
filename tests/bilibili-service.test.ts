import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { BilibiliClient } from '../src/main/services/bilibili/bilibili-client';
import { BilibiliService, type BilibiliServiceOptions } from '../src/main/services/bilibili/bilibili-service';
import { ContentCurator } from '../src/main/services/bilibili/content-curator';
import { BilibiliHistoryStore, BilibiliSettingsStore } from '../src/main/storage/bilibili-store';
import type { BilibiliShare, BilibiliVideo } from '../src/shared/bilibili';
import { noopLogger } from '../src/main/util/logger';
import type { TimerHandle } from '../src/main/util/misc';

function makeVideo(overrides: Partial<BilibiliVideo> = {}): BilibiliVideo {
  return {
    bvid: 'BV1aa411c7mD',
    title: '胡桃整活名场面',
    upName: '往生堂',
    coverUrl: 'https://i0.hdslb.com/a.jpg',
    durationSeconds: 180,
    viewCount: 900_000,
    danmakuCount: 200,
    publishedAt: new Date().toISOString(),
    category: '鬼畜',
    url: 'https://www.bilibili.com/video/BV1aa411c7mD',
    ...overrides
  };
}

interface Harness {
  service: BilibiliService;
  settings: BilibiliSettingsStore;
  history: BilibiliHistoryStore;
  shares: BilibiliShare[];
  dir: string;
}

function createHarness(
  collect: () => Promise<BilibiliVideo[]>,
  options: Partial<BilibiliServiceOptions> = {}
): Harness {
  const dir = mkdtempSync(join(tmpdir(), 'hutao-bilibili-'));
  const settings = new BilibiliSettingsStore(dir);
  settings.load();
  const history = new BilibiliHistoryStore(dir);
  history.load();
  const shares: BilibiliShare[] = [];

  const client = {
    collectCandidates: collect,
    fetchVideo: async () => null,
    fetchCoverDataUrl: async () => 'data:image/jpeg;base64,AAAA'
  } as unknown as BilibiliClient;

  const service = new BilibiliService({
    settings,
    history,
    client,
    curator: new ContentCurator(() => 0),
    logger: noopLogger,
    onShare: (share) => shares.push(share),
    openExternal: async () => undefined,
    copyText: () => undefined,
    now: () => new Date('2026-10-27T10:00:00+08:00'),
    random: () => 0.5,
    ...options
  });

  return { service, settings, history, shares, dir };
}

async function waitUntil(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const startedAt = Date.now();

  while (!predicate() && Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

interface ManualTimer {
  callback: () => void;
  delayMs: number;
}

function createManualScheduler(scheduled: ManualTimer[]): (callback: () => void, delayMs: number) => TimerHandle {
  return (callback, delayMs) => {
    scheduled.push({ callback, delayMs });
    return {
      cancel: () => undefined
    };
  };
}

test('browse 成功时产出分享、写入历史并推送事件', async (t) => {
  const videoA = makeVideo();
  const videoB = makeVideo({ bvid: 'BV1bb411c7mD', title: '另一个整活', viewCount: 300_000 });
  const harness = createHarness(async () => [videoB, videoA]);
  t.after(() => rmSync(harness.dir, { recursive: true, force: true }));

  const result = await harness.service.browse({ source: 'manual' });

  assert.equal(result.ok, true);
  assert.equal(result.share?.video.bvid, 'BV1aa411c7mD');
  assert.equal(harness.shares.length, 1);
  assert.ok(harness.history.get().seenBvids.includes('BV1aa411c7mD'));
  assert.equal(harness.history.get().shares.length, 1);

  const status = harness.service.getStatus();
  assert.equal(status.totalShared, 1);
  assert.equal(status.todayShared, 0, '手动逛站不计入每日自动分享配额');
});

test('第二次 browse 会避开已经看过的稿件', async (t) => {
  const videoA = makeVideo();
  const videoB = makeVideo({ bvid: 'BV1bb411c7mD', title: '另一个整活', viewCount: 300_000 });
  const harness = createHarness(async () => [videoB, videoA]);
  t.after(() => rmSync(harness.dir, { recursive: true, force: true }));

  const first = await harness.service.browse({ source: 'manual' });
  const second = await harness.service.browse({ source: 'manual' });

  assert.equal(first.share?.video.bvid, 'BV1aa411c7mD');
  assert.equal(second.share?.video.bvid, 'BV1bb411c7mD');
});

test('候选用尽时返回没挑到的提示且不产生分享', async (t) => {
  const harness = createHarness(async () => [makeVideo()]);
  t.after(() => rmSync(harness.dir, { recursive: true, force: true }));

  await harness.service.browse({ source: 'manual' });
  const result = await harness.service.browse({ source: 'manual' });

  assert.equal(result.ok, false);
  assert.match(result.message, /没挑到/);
  assert.equal(harness.shares.length, 1);
});

test('抓取失败时给出离线提示并记录错误', async (t) => {
  const harness = createHarness(async () => {
    throw new Error('network down');
  });
  t.after(() => rmSync(harness.dir, { recursive: true, force: true }));

  const result = await harness.service.browse({ source: 'auto' });

  assert.equal(result.ok, false);
  assert.equal(result.error, 'network down');
  assert.match(result.message, /连不上/);
  assert.equal(harness.service.getStatus().lastError, 'network down');
});

test('feedback 会影响后续推荐偏好', async (t) => {
  const harness = createHarness(async () => [makeVideo()]);
  t.after(() => rmSync(harness.dir, { recursive: true, force: true }));

  const result = await harness.service.browse({ source: 'manual' });
  const bvid = result.share?.video.bvid ?? '';

  harness.service.feedback({ bvid, action: 'dislike' });
  assert.ok(harness.history.get().dislikedBvids.includes(bvid));
  assert.ok(harness.history.get().dislikedUpNames.includes('往生堂'));
  assert.equal(harness.service.getStatus().recentShares.some((share) => share.id === bvid), false);

  harness.service.feedback({ bvid, action: 'like' });
  assert.ok(harness.history.get().likedUpNames.includes('往生堂'));
  assert.ok(!harness.history.get().dislikedUpNames.includes('往生堂'));
});

test('getCover 命中历史稿件时返回 data URL', async (t) => {
  const harness = createHarness(async () => [makeVideo()]);
  t.after(() => rmSync(harness.dir, { recursive: true, force: true }));

  const result = await harness.service.browse({ source: 'manual' });
  const bvid = result.share?.video.bvid ?? '';
  const cover = await harness.service.getCover(bvid);

  assert.equal(cover.ok, true);
  assert.match(cover.dataUrl ?? '', /^data:image\/jpeg;base64,/);
  assert.equal((await harness.service.getCover('bad-bvid')).ok, false);
});

test('clearHistory 清空分享与计数', async (t) => {
  const harness = createHarness(async () => [makeVideo()]);
  t.after(() => rmSync(harness.dir, { recursive: true, force: true }));

  await harness.service.browse({ source: 'manual' });
  const status = harness.service.clearHistory();

  assert.equal(status.totalShared, 0);
  assert.equal(status.seenCount, 0);
  assert.deepEqual(status.recentShares, []);
});

test('start 后到点会自动逛站、推送分享并安排下一轮', async (t) => {
  const scheduled: ManualTimer[] = [];
  const harness = createHarness(async () => [makeVideo()], {
    schedule: createManualScheduler(scheduled)
  });
  t.after(() => rmSync(harness.dir, { recursive: true, force: true }));

  harness.service.start();
  assert.equal(scheduled.length, 1);
  assert.ok(scheduled[0].delayMs >= 90_000 && scheduled[0].delayMs <= 240_000);

  scheduled[0].callback();
  await waitUntil(() => harness.shares.length === 1);

  assert.equal(harness.shares.length, 1);
  assert.equal(harness.shares[0].source, 'auto');
  assert.equal(harness.history.get().dailyCount, 1);
  assert.equal(scheduled.length, 2);
  assert.ok(scheduled[1].delayMs >= 15 * 60_000 * 0.75);
});

test('安静时段内到点不逛站，而是推迟到时段之后', async (t) => {
  const scheduled: ManualTimer[] = [];
  const harness = createHarness(async () => [makeVideo()], {
    schedule: createManualScheduler(scheduled),
    now: () => new Date('2026-10-27T01:00:00+08:00')
  });
  t.after(() => rmSync(harness.dir, { recursive: true, force: true }));

  harness.service.start();
  scheduled[0].callback();
  await waitUntil(() => scheduled.length === 2);

  assert.equal(harness.shares.length, 0);
  assert.ok(scheduled.length >= 2);
  assert.ok(scheduled[1].delayMs > 6 * 60 * 60_000, '安静时段应推迟到早上 07:30 之后');
});
