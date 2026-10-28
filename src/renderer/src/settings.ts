import type { PetSettings } from '../../shared';
import { state } from './state';
import { showBubble } from './modules/bubble';
import { scheduleRoam, stopRoam } from './modules/roam';

export function applySettings(nextSettings: PetSettings): void {
  const hadSettings = state.settings !== null;
  const roamChanged = state.settings?.roamEnabled !== nextSettings.roamEnabled;
  const alwaysOnTopChanged = state.settings?.alwaysOnTop !== nextSettings.alwaysOnTop;
  const scaleChanged = state.settings?.scale !== nextSettings.scale;

  state.settings = nextSettings;

  if (hadSettings && roamChanged) {
    if (nextSettings.roamEnabled) {
      scheduleRoam();
    } else {
      stopRoam();
    }
  }

  if (hadSettings && alwaysOnTopChanged) {
    showBubble(nextSettings.alwaysOnTop ? '我回到最前面啦。' : '我会乖乖待在窗口后面。', 2200);
  }

  if (hadSettings && scaleChanged) {
    showBubble(`大小调整到 ${Math.round(nextSettings.scale * 100)}%。`, 2000);
  }
}
