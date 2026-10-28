import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chooseIdleGesture,
  isFlusteredPat,
  shouldNightBoo,
  shouldUmbrellaRoam,
  shouldUseNap
} from '../src/renderer/src/modules/action-rules';

test('chooseIdleGesture 按时间与随机数选择特殊动作', () => {
  assert.equal(chooseIdleGesture(22, 0.1), 'boo');
  assert.equal(chooseIdleGesture(22, 0.2), 'lantern');
  assert.equal(chooseIdleGesture(3, 0.2), 'talisman');
  assert.equal(chooseIdleGesture(14, 0.3), 'talisman');
  assert.equal(chooseIdleGesture(14, 0.5), null);
});

test('shouldUmbrellaRoam / shouldUseNap 的阈值稳定', () => {
  assert.equal(shouldUmbrellaRoam(0.24), true);
  assert.equal(shouldUmbrellaRoam(0.25), false);
  assert.equal(shouldUseNap(0.44), true);
  assert.equal(shouldUseNap(0.45), false);
});

test('shouldNightBoo 只在夜间低概率触发', () => {
  assert.equal(shouldNightBoo(21, 0.07), true);
  assert.equal(shouldNightBoo(3, 0.0), true);
  assert.equal(shouldNightBoo(14, 0.0), false);
  assert.equal(shouldNightBoo(21, 0.08), false);
});

test('isFlusteredPat 要求连续 3 次且间隔在 10 秒内', () => {
  assert.equal(isFlusteredPat(3, 0), true);
  assert.equal(isFlusteredPat(3, 10_000), true);
  assert.equal(isFlusteredPat(3, 10_001), false);
  assert.equal(isFlusteredPat(2, 0), false);
});
