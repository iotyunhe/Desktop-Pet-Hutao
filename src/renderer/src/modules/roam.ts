import { requireApi } from '../api';
import {
  IDLE_COMMENT_JITTER_MS,
  IDLE_COMMENT_MIN_MS,
  ROAM_INTERVAL_JITTER_MS,
  ROAM_INTERVAL_MIN_MS,
  ROAM_STEP_DELAY_MS,
  ROAM_STEPS,
  SLEEP_AFTER_MS,
  TEA_OFFER_FIRST_MS,
  TEA_OFFER_REPEAT_MS,
  TEA_OFFER_RETRY_MS
} from '../constants';
import { delay, randomItem } from '../dom';
import { state, isSleeping } from '../state';
import { shouldUmbrellaRoam, shouldUseNap } from './action-rules';
import { showBubble, showBurst } from './bubble';
import { maybePlayIdleGesture, playOfferTea } from './gestures';
import { BEST_FRIEND_REACTIONS, IDLE_REACTIONS, NAP_LINES, SLEEP_LINES, UMBRELLA_LINES } from './lines';
import { playWalkingMood, restoreMoodAfterWalk, setMood, setTemporaryMood } from './mood';

export function noteInteraction(): void {
  state.lastInteractionAt = Date.now();
  resetSleepTimer();
}

export function resetSleepTimer(): void {
  window.clearTimeout(state.timers.sleep);
  state.timers.sleep = window.setTimeout(() => {
    if (state.dragging || state.panelMode !== 'none') {
      resetSleepTimer();
      return;
    }

    stopRoam();
    const useNap = shouldUseNap(Math.random());
    setMood(useNap ? 'nap' : 'sleepy');
    showBubble(randomItem(useNap ? NAP_LINES : SLEEP_LINES), 2600);
    showBurst('sleepy');
  }, SLEEP_AFTER_MS);
}

export function stopRoam(): void {
  state.roamRunId += 1;
  window.clearTimeout(state.timers.roam);
}

export function scheduleRoam(): void {
  window.clearTimeout(state.timers.roam);

  if (!state.settings?.roamEnabled || state.dragging || isSleeping() || state.panelMode !== 'none') {
    return;
  }

  state.timers.roam = window.setTimeout(() => {
    const runId = state.roamRunId + 1;
    state.roamRunId = runId;
    void performRoam(runId);
  }, ROAM_INTERVAL_MIN_MS + Math.random() * ROAM_INTERVAL_JITTER_MS);
}

export function scheduleTeaOffer(delayMs = TEA_OFFER_FIRST_MS): void {
  window.clearTimeout(state.timers.teaOffer);
  state.timers.teaOffer = window.setTimeout(() => {
    if (state.dragging || state.panelMode !== 'none' || state.mood !== 'idle' || isSleeping()) {
      scheduleTeaOffer(TEA_OFFER_RETRY_MS);
      return;
    }

    playOfferTea();
    scheduleTeaOffer(TEA_OFFER_REPEAT_MS);
  }, delayMs);
}

async function performRoam(runId: number): Promise<void> {
  const api = requireApi();

  if (!state.settings?.roamEnabled || state.dragging || state.mood !== 'idle' || state.panelMode !== 'none') {
    scheduleRoam();
    return;
  }

  const totalX = Math.round((Math.random() > 0.5 ? 1 : -1) * (70 + Math.random() * 120));
  const totalY = Math.round((Math.random() - 0.5) * 42);
  const previousMood = state.mood;
  const umbrella = shouldUmbrellaRoam(Math.random());

  playWalkingMood(totalX < 0 ? 'left' : 'right', umbrella);
  if (umbrella && Math.random() < 0.45) {
    showBubble(randomItem(UMBRELLA_LINES), 2800);
  }

  try {
    for (let step = 0; step < ROAM_STEPS; step += 1) {
      if (
        runId !== state.roamRunId ||
        state.dragging ||
        isSleeping() ||
        state.panelMode !== 'none' ||
        !state.settings?.roamEnabled
      ) {
        return;
      }

      const previousX = Math.round((step * totalX) / ROAM_STEPS);
      const previousY = Math.round((step * totalY) / ROAM_STEPS);
      const nextX = Math.round(((step + 1) * totalX) / ROAM_STEPS);
      const nextY = Math.round(((step + 1) * totalY) / ROAM_STEPS);

      await api.moveBy({
        x: nextX - previousX,
        y: nextY - previousY
      });
      await delay(ROAM_STEP_DELAY_MS);
    }
  } finally {
    restoreMoodAfterWalk(previousMood);
  }

  scheduleRoam();
}

export function scheduleIdleComment(): void {
  window.clearTimeout(state.timers.idleComment);
  state.timers.idleComment = window.setTimeout(() => {
    if (!state.dragging && state.mood === 'idle' && state.panelMode === 'none') {
      if (maybePlayIdleGesture()) {
        scheduleIdleComment();
        return;
      }

      const pool = state.careProfile?.level === 10 ? [...IDLE_REACTIONS, ...BEST_FRIEND_REACTIONS] : IDLE_REACTIONS;
      const reaction = randomItem(pool);

      setTemporaryMood(reaction.mood, 1900);
      showBubble(reaction.line, 2600);
      if (reaction.burst) {
        showBurst(reaction.burst);
      }
    }

    scheduleIdleComment();
  }, IDLE_COMMENT_MIN_MS + Math.random() * IDLE_COMMENT_JITTER_MS);
}
