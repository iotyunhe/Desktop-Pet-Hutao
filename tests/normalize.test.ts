import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getCareLevel,
  normalizeBilibiliInterests,
  normalizeBilibiliSettings,
  normalizeCareProfile,
  normalizeSettings
} from '../src/shared/normalize';
import { DEFAULT_BILIBILI_SETTINGS } from '../src/shared/bilibili';
import { DEFAULT_SETTINGS } from '../src/shared/pet';

test('normalizeSettings 会夹紧缩放并丢掉非法坐标', () => {
  const settings = normalizeSettings({
    scale: 5,
    lastPosition: { x: 1.6, y: 'nope' }
  });

  assert.equal(settings.scale, 1);
  assert.equal(settings.lastPosition, null);
  assert.equal(settings.alwaysOnTop, DEFAULT_SETTINGS.alwaysOnTop);
});

test('normalizeSettings 把坐标取整并保留合法位置', () => {
  const settings = normalizeSettings({
    scale: 0.1,
    lastPosition: { x: 12.7, y: -3.2 }
  });

  assert.equal(settings.scale, 0.6);
  assert.deepEqual(settings.lastPosition, { x: 13, y: -3 });
});

test('normalizeCareProfile 根据亲密度推导等级与解锁奖励', () => {
  const profile = normalizeCareProfile({
    affection: 420,
    moodScore: 999,
    energy: -5,
    inventory: { tea: 3, snack: -2 }
  });

  assert.equal(profile.level, 5);
  assert.deepEqual(profile.unlockedRewards, ['pat_lines', 'feed_lines']);
  assert.equal(profile.moodScore, 100);
  assert.equal(profile.energy, 0);
  assert.equal(profile.inventory.tea, 3);
  assert.equal(profile.inventory.snack, 0);
  assert.equal(profile.inventory.plum_cake, 1);
});

test('getCareLevel 上限为 10', () => {
  assert.equal(getCareLevel(0), 1);
  assert.equal(getCareLevel(1000), 10);
  assert.equal(getCareLevel(99999), 10);
});

test('normalizeBilibiliInterests 去重、裁剪并回退默认值', () => {
  assert.deepEqual(normalizeBilibiliInterests('原神, 原神，搞笑、 整活'), ['原神', '搞笑', '整活']);
  assert.deepEqual(normalizeBilibiliInterests([]), DEFAULT_BILIBILI_SETTINGS.interests);
  assert.equal(normalizeBilibiliInterests(['一二三四五六七八九十十一十二十三'])[0]?.length, 12);
});

test('normalizeBilibiliSettings 夹紧时间间隔与安静时段', () => {
  const settings = normalizeBilibiliSettings({
    shareIntervalMinutes: 1,
    dailyShareLimit: 99,
    quietHoursStart: '25:00',
    quietHoursEnd: '08:30',
    interests: '原神，搞笑'
  });

  assert.equal(settings.shareIntervalMinutes, 15);
  assert.equal(settings.dailyShareLimit, 24);
  assert.equal(settings.quietHoursStart, DEFAULT_BILIBILI_SETTINGS.quietHoursStart);
  assert.equal(settings.quietHoursEnd, '08:30');
  assert.deepEqual(settings.interests, ['原神', '搞笑']);
});
