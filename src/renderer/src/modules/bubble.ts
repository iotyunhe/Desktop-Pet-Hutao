import { getElements } from '../dom';
import { state, type BurstKind } from '../state';

/** 气泡是最容易被长文本撑开的 UI，统一截断，避免任何来源把窗口视觉撑满。 */
const MAX_BUBBLE_TEXT_LENGTH = 180;

export function showBubble(text: string, duration = 2800): void {
  // 拖拽/长按期间不弹新气泡；否则动作的二段台词会在按住时突然冒出来。
  if (state.dragging) {
    return;
  }

  const { bubble } = getElements();
  const normalized = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  const content =
    normalized.length > MAX_BUBBLE_TEXT_LENGTH
      ? `${normalized.slice(0, MAX_BUBBLE_TEXT_LENGTH - 1)}…`
      : normalized || '……';

  window.clearTimeout(state.timers.bubble);
  bubble.textContent = content;
  bubble.hidden = false;
  state.timers.bubble = window.setTimeout(() => {
    bubble.hidden = true;
  }, duration);
}

export function hideBubble(): void {
  window.clearTimeout(state.timers.bubble);
  getElements().bubble.hidden = true;
}

export function showBurst(kind: BurstKind): void {
  const { burst } = getElements();

  window.clearTimeout(state.timers.burst);
  burst.className = `reaction-burst is-active burst-${kind}`;
  state.timers.burst = window.setTimeout(() => {
    burst.className = 'reaction-burst';
  }, 720);
}
