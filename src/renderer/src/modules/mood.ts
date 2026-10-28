import { getElements } from '../dom';
import { sprites } from '../sprites';
import { isSleepingMood, isWalkingMood, state, type PetMood } from '../state';

export function setMood(nextMood: PetMood): void {
  state.mood = nextMood;
  const { petButton, petImage } = getElements();

  petButton.dataset.mood = nextMood;
  if (petImage.src !== sprites[nextMood]) {
    petImage.src = sprites[nextMood];
  }
}

export function setPressing(isPressing: boolean): void {
  getElements().petButton.classList.toggle('is-pressing', isPressing);
}

export function setTemporaryMood(nextMood: PetMood, duration = 1400): void {
  window.clearTimeout(state.timers.activeMood);
  setMood(nextMood);

  state.timers.activeMood = window.setTimeout(() => {
    if (!state.dragging && !isSleepingMood(state.mood)) {
      setMood('idle');
    }
  }, duration);
}

export function playWalkingMood(direction: 'left' | 'right', umbrella = false): void {
  window.clearTimeout(state.timers.activeMood);

  if (umbrella) {
    setMood(direction === 'left' ? 'umbrella-walk-left' : 'umbrella-walk-right');
    return;
  }

  setMood(direction === 'left' ? 'walking-left' : 'walking-right');
}

export function restoreMoodAfterWalk(previousMood: PetMood): void {
  if (isWalkingMood(state.mood)) {
    setMood(previousMood);
  }
}
