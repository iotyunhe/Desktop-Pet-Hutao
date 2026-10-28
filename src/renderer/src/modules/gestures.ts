import { randomItem } from '../dom';
import { state, type PetMood } from '../state';
import { chooseIdleGesture } from './action-rules';
import { showBubble, showBurst } from './bubble';
import {
  ABACUS_LINES,
  BOO_GRIN_LINES,
  BOO_LINES,
  FLUSTERED_LINES,
  LANTERN_LINES,
  OFFER_TEA_LINES,
  TALISMAN_LINES,
  TWIRL_LINES
} from './lines';
import { setMood } from './mood';

const SPECIAL_IDLE_COOLDOWN_MS = 3 * 60_000;

/** 切到某个动作，结束后在「期间没被别的状态打断」的前提下回到 idle。 */
function holdMood(mood: PetMood, durationMs: number, next: PetMood = 'idle'): void {
  setMood(mood);
  window.setTimeout(() => {
    if (state.mood === mood) {
      setMood(next);
    }
  }, durationMs);
}

export function playLanternWish(): void {
  holdMood('lantern-wish', 4200);
  showBubble(randomItem(LANTERN_LINES), 3000);
  showBurst('happy');
}

export function playTalisman(): void {
  holdMood('talisman', 2400);
  showBubble(randomItem(TALISMAN_LINES), 2600);
}

export function playBoo(): void {
  setMood('boo');
  showBubble(randomItem(BOO_LINES), 2000);
  showBurst('curious');

  window.setTimeout(() => {
    if (state.mood !== 'boo') {
      return;
    }

    setMood('boo-grin');
    showBubble(randomItem(BOO_GRIN_LINES), 2400);
  }, 1150);

  window.setTimeout(() => {
    if (state.mood === 'boo-grin') {
      setMood('idle');
    }
  }, 3400);
}

export function playFlustered(): void {
  holdMood('flustered-pat', 1800);
  showBubble(randomItem(FLUSTERED_LINES), 2400);
  showBurst('curious');
}

export function playOfferTea(): void {
  holdMood('offer-tea', 4200);
  showBubble(randomItem(OFFER_TEA_LINES), 3200);
}

export function playTwirl(): void {
  holdMood('twirl', 2200);
  showBubble(randomItem(TWIRL_LINES), 2400);
  showBurst('happy');
}

export function playAbacus(): void {
  holdMood('abacus', 3200);
  showBubble(randomItem(ABACUS_LINES), 2800);
}

/** 睡醒时先伸个懒腰，再回到待机；气泡由调用方给唤醒台词。 */
export function playStretch(): void {
  holdMood('stretch', 1200);
}

/**
 * 空闲时按时间与概率挑一个特殊动作。返回 true 表示已经播放，
 * 调用方就不要再显示普通 idle 台词了。
 */
export function maybePlayIdleGesture(now = new Date()): boolean {
  if (Date.now() - state.lastSpecialActionAt < SPECIAL_IDLE_COOLDOWN_MS) {
    return false;
  }

  const gesture = chooseIdleGesture(now.getHours(), Math.random());
  if (!gesture) {
    return false;
  }

  state.lastSpecialActionAt = Date.now();

  if (gesture === 'boo') {
    playBoo();
  } else if (gesture === 'lantern') {
    playLanternWish();
  } else {
    playTalisman();
  }

  return true;
}
