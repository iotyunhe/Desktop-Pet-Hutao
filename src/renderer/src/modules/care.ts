import type { CareActionResult, CareActionType, CareItemId } from '../../../shared';
import { requireApi } from '../api';
import { state } from '../state';
import { isFlusteredPat, PAT_FLUSTER_WINDOW_MS } from './action-rules';
import { showBubble, showBurst } from './bubble';
import { playAbacus, playFlustered, playLanternWish, playTwirl } from './gestures';
import { setMood } from './mood';
import { refreshPanel } from './panel';
import { noteInteraction, scheduleRoam, stopRoam } from './roam';

function appendUnlockText(line: string, result: CareActionResult): string {
  if (result.unlockedRewards.length === 0) {
    return line;
  }

  return `${line} 解锁了新的互动！`;
}

export function applyCareResult(result: CareActionResult): void {
  state.careProfile = result.profile;
  refreshPanel();
  stopRoam();
  noteInteraction();
  showBubble(appendUnlockText(result.line, result), result.ok ? 3200 : 2600);

  if (result.burst) {
    showBurst(result.burst);
  }

  const nextMood = result.mood;
  window.clearTimeout(state.timers.activeMood);
  setMood(nextMood);
  state.timers.activeMood = window.setTimeout(() => {
    if (!state.dragging && state.mood === nextMood) {
      setMood('idle');
      scheduleRoam();
    }
  }, nextMood === 'sleepy' ? 4200 : 2200);

  if (result.ok && result.itemId === 'lantern') {
    playLanternWish();
    window.setTimeout(scheduleRoam, 4600);
    return;
  }

  if (result.ok && result.unlockedRewards.length > 0) {
    window.setTimeout(() => {
      playTwirl();
      window.setTimeout(scheduleRoam, 2600);
    }, 500);
  }
}

export async function performCareAction(type: CareActionType, itemId?: CareItemId): Promise<void> {
  const result = await requireApi().performCareAction({ type, itemId });

  if (type === 'pat') {
    const now = Date.now();
    const previousAt = state.lastPatAt;
    const withinWindow = now - previousAt <= PAT_FLUSTER_WINDOW_MS;

    state.patStreak = withinWindow ? state.patStreak + 1 : 1;
    state.lastPatAt = now;
    applyCareResult(result);

    if (result.ok && isFlusteredPat(state.patStreak, now - previousAt)) {
      state.patStreak = 0;
      playFlustered();
      window.setTimeout(scheduleRoam, 2200);
    }

    return;
  }

  applyCareResult(result);
}

export async function claimDailyPack(): Promise<void> {
  const result = await requireApi().claimDailyCarePack();
  applyCareResult(result);

  if (result.ok) {
    window.setTimeout(() => {
      playAbacus();
      window.setTimeout(scheduleRoam, 3400);
    }, 700);
  }
}

export async function refreshCareProfile(): Promise<void> {
  state.careProfile = await requireApi().getCareProfile();
  refreshPanel();
}
