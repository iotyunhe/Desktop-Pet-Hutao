import './styles/index.css';
import { bindPanelInteractions } from './actions';
import { getApi } from './api';
import { AI_OBSERVE_INITIAL_DELAY_MS } from './constants';
import { mountShell, type ShellElements } from './dom';
import { applySettings } from './settings';
import { state } from './state';
import { refreshAiStatus, scheduleAiObservation } from './modules/ai';
import { handleBrowsingEvent, handlePushedShare, openCurrentShare, refreshBilibiliStatus } from './modules/bilibili';
import { showBubble } from './modules/bubble';
import { refreshCareProfile } from './modules/care';
import { onDocumentPointerMove, onDocumentPointerUp, onPetPointerDown } from './modules/drag';
import { setPressing } from './modules/mood';
import { closePanel, refreshPanel, toggleCarePanel } from './modules/panel';
import { updateMousePassthrough } from './modules/passthrough';
import { resetSleepTimer, scheduleIdleComment, scheduleRoam, scheduleTeaOffer } from './modules/roam';
import { stopReplyVoice } from './modules/voice';

const unsubscribers: Array<() => void> = [];

function bindContextMenu(element: Element): void {
  element.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void getApi()?.showContextMenu();
  });
}

function bindShell(elements: ShellElements): void {
  const api = getApi();
  if (!api) {
    return;
  }

  elements.petButton.addEventListener('pointerdown', (event) => {
    onPetPointerDown(event).catch((error: unknown) => {
      console.error('拖拽启动失败', error);
    });
  });
  bindContextMenu(elements.petButton);
  bindContextMenu(elements.menuButton);

  elements.menuButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (state.unreadShare && state.currentShare) {
      void openCurrentShare();
      return;
    }

    const opening = state.panelMode !== 'care';
    void toggleCarePanel().then(() => {
      if (!opening) {
        return;
      }

      void refreshCareProfile();
      void refreshAiStatus();
      void refreshBilibiliStatus();
    });
  });

  document.addEventListener('pointermove', (event) => {
    void onDocumentPointerMove(event);
  });
  document.addEventListener('pointerup', (event) => {
    void onDocumentPointerUp(event);
  });
  document.addEventListener('pointercancel', (event) => {
    void onDocumentPointerUp(event);
  });
  document.addEventListener('mousemove', (event) => {
    updateMousePassthrough(event.target);
  });
  document.addEventListener('mouseleave', () => {
    if (!state.dragging && state.panelMode === 'none') {
      state.mousePassthrough = true;
      void api.setMousePassthrough(true);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.panelMode !== 'none') {
      void closePanel();
    }
  });
}

function bindIpcEvents(): void {
  const api = getApi();
  if (!api) {
    return;
  }

  unsubscribers.push(
    api.onSettingsChanged((nextSettings) => {
      applySettings(nextSettings);
    })
  );
  unsubscribers.push(
    api.onBilibiliBrowsing((event) => {
      handleBrowsingEvent(event);
    })
  );
  unsubscribers.push(
    api.onBilibiliShare((share) => {
      void handlePushedShare(share);
    })
  );
}

async function boot(): Promise<void> {
  const elements = mountShell();
  bindPanelInteractions(elements.panel);

  const api = getApi();
  if (!api) {
    showBubble('桌宠通信没有连上，请重新启动。', 4000);
    return;
  }

  bindShell(elements);

  try {
    applySettings(await api.getSettings());
  } catch (error) {
    console.error('读取桌宠设置失败', error);
  }

  await Promise.allSettled([refreshCareProfile(), refreshAiStatus(), refreshBilibiliStatus()]);

  bindIpcEvents();
  refreshPanel();
  updateMousePassthrough(document.elementFromPoint(0, 0));

  resetSleepTimer();
  scheduleRoam();
  scheduleAiObservation(AI_OBSERVE_INITIAL_DELAY_MS);
  scheduleIdleComment();
  scheduleTeaOffer();
}

window.addEventListener('beforeunload', () => {
  for (const timer of Object.values(state.timers)) {
    window.clearTimeout(timer);
  }

  for (const unsubscribe of unsubscribers.splice(0)) {
    unsubscribe();
  }

  stopReplyVoice();
  setPressing(false);
  void getApi()?.setMousePassthrough(false);
});

void boot().catch((error: unknown) => {
  console.error('桌宠启动失败', error);
  showBubble('启动时有点小问题，重启一下试试。', 5000);
});
