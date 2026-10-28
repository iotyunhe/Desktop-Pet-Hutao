import { randomItem } from '../dom';
import { state } from '../state';
import { shouldNightBoo } from './action-rules';
import { showBubble, showBurst } from './bubble';
import { playBoo, playStretch } from './gestures';
import { BEST_FRIEND_REACTIONS, CLICK_REACTIONS, WAKE_LINES } from './lines';
import { setTemporaryMood } from './mood';
import { noteInteraction, scheduleRoam } from './roam';

export function handlePetClick(wasSleeping: boolean): void {
  noteInteraction();

  if (wasSleeping) {
    playStretch();
    showBubble(randomItem(WAKE_LINES), 2600);
    showBurst('curious');
    scheduleRoam();
    return;
  }

  if (shouldNightBoo(new Date().getHours(), Math.random())) {
    playBoo();
    return;
  }

  const bestFriendReaction = state.careProfile?.level === 10 && Math.random() < 0.4
    ? randomItem(BEST_FRIEND_REACTIONS)
    : null;
  const reaction = bestFriendReaction ?? randomItem(CLICK_REACTIONS);

  setTemporaryMood(reaction.mood, reaction.duration ?? (bestFriendReaction ? 1800 : 1500));
  showBubble(reaction.line);
  if (reaction.burst) {
    showBurst(reaction.burst);
  }
}
