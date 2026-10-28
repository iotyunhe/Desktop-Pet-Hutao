import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatMinutesToClock,
  isWithinQuietHours,
  parseClockToMinutes
} from '../src/shared/bilibili';

test('parseClockToMinutes 解析并拒绝非法时间', () => {
  assert.equal(parseClockToMinutes('00:00'), 0);
  assert.equal(parseClockToMinutes('08:30'), 510);
  assert.equal(parseClockToMinutes('23:59'), 1439);
  assert.equal(parseClockToMinutes('24:00'), null);
  assert.equal(parseClockToMinutes('8:3'), null);
  assert.equal(parseClockToMinutes('abc'), null);
});

test('formatMinutesToClock 支持跨天回卷', () => {
  assert.equal(formatMinutesToClock(510), '08:30');
  assert.equal(formatMinutesToClock(1440 + 90), '01:30');
  assert.equal(formatMinutesToClock(-30), '23:30');
});

test('isWithinQuietHours 处理跨午夜与普通区间', () => {
  assert.equal(isWithinQuietHours(23 * 60 + 45, '23:30', '08:30'), true);
  assert.equal(isWithinQuietHours(7 * 60, '23:30', '08:30'), true);
  assert.equal(isWithinQuietHours(12 * 60, '23:30', '08:30'), false);
  assert.equal(isWithinQuietHours(8 * 60 + 29, '23:30', '08:30'), true);
  assert.equal(isWithinQuietHours(8 * 60 + 30, '23:30', '08:30'), false);
  assert.equal(isWithinQuietHours(10 * 60, '09:00', '17:00'), true);
  assert.equal(isWithinQuietHours(18 * 60, '09:00', '17:00'), false);
  assert.equal(isWithinQuietHours(12 * 60, '09:00', '09:00'), false);
});
