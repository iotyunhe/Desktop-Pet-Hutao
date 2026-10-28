/** 纯规则函数：把「什么时候触发哪种动作」从 DOM 与计时器里抽出来，方便单测。 */

export type IdleGesture = 'boo' | 'lantern' | 'talisman' | null;

export const UMBRELLA_ROAM_CHANCE = 0.25;
export const NAP_CHANCE = 0.45;
export const NIGHT_BOO_CHANCE = 0.08;
export const PAT_FLUSTER_STREAK = 3;
export const PAT_FLUSTER_WINDOW_MS = 10_000;

export function isNightHour(hour: number): boolean {
  return hour >= 20 || hour < 6;
}

export function isEveningHour(hour: number): boolean {
  return hour >= 19 && hour <= 22;
}

/**
 * 空闲特殊动作的优先级：夜间扮鬼 > 傍晚放灯 > 画符。
 * `roll` 是 [0,1) 随机数，方便在测试里固定结果。
 */
export function chooseIdleGesture(hour: number, roll: number): IdleGesture {
  if (isNightHour(hour) && roll < 0.16) {
    return 'boo';
  }

  if (isEveningHour(hour) && roll < 0.3) {
    return 'lantern';
  }

  if (roll < 0.38) {
    return 'talisman';
  }

  return null;
}

export function shouldUmbrellaRoam(roll: number): boolean {
  return roll < UMBRELLA_ROAM_CHANCE;
}

export function shouldUseNap(roll: number): boolean {
  return roll < NAP_CHANCE;
}

export function shouldNightBoo(hour: number, roll: number): boolean {
  return isNightHour(hour) && roll < NIGHT_BOO_CHANCE;
}

export function isFlusteredPat(streak: number, elapsedMs: number): boolean {
  return streak >= PAT_FLUSTER_STREAK && elapsedMs >= 0 && elapsedMs <= PAT_FLUSTER_WINDOW_MS;
}
