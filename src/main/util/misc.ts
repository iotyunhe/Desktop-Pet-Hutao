export interface TimerHandle {
  cancel(): void;
}

/** 可取消的单次定时器，定时器 id 只在闭包里流动，避免全局串号。 */
export function scheduleTimer(callback: () => void, delayMs: number): TimerHandle {
  const safeDelay = Math.max(0, Math.round(delayMs));
  const timer = setTimeout(callback, safeDelay);

  return {
    cancel: () => clearTimeout(timer)
  };
}
