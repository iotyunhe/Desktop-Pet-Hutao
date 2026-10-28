import './styles/index.css';
import { PET_WINDOW_BASE_SIZE } from '../../shared';
import { bindPanelInteractions } from './actions';
import { getApi } from './api';
import { AI_OBSERVE_INITIAL_DELAY_MS } from './constants';
import { getElements, mountShell, type ShellElements } from './dom';
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
let panelGuardTimer = 0;
let panelGuardStrikes = 0;

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

/**
 * 兜底校正：如果窗口是展开尺寸但面板已经不可见，或面板状态为 none 但窗口仍很宽，
 * 连续两次检查后强制归位，避免留下「一大块透明区域 + 菜单在很远处」的残局。
 */
function ensurePanelConsistency(): void {
  const api = getApi();
  if (!api || !state.settings) {
    return;
  }

  const petWidth = Math.round(PET_WINDOW_BASE_SIZE.width * state.settings.scale);
  const panel = getElements().panel;
  const panelRect = panel.getBoundingClientRect();
  const inconsistent =
    state.panelMode === 'none'
      ? window.innerWidth > petWidth + 16
      : panel.hidden || panelRect.width < 40;

  if (!inconsistent) {
    panelGuardStrikes = 0;
    return;
  }

  panelGuardStrikes += 1;
  if (panelGuardStrikes < 2) {
    return;
  }

  panelGuardStrikes = 0;

  if (state.panelMode === 'none') {
    void api.setPanelMode('none');
  } else {
    void closePanel();
  }
}

function bindIpcEvents(): void {  const api = getApi();
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

  // 渲染层重载/异常恢复时，主进程可能仍停留在面板展开的窗口尺寸；
  // 启动时强制归位，避免出现「窗口很宽但面板是空的」。
  try {
    await api.setPanelMode('none');
  } catch (error) {
    console.error('重置面板布局失败', error);
  }
  state.panelMode = 'none';

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
  panelGuardTimer = window.setInterval(ensurePanelConsistency, 1_000);
}

window.addEventListener('beforeunload', () => {
  window.clearInterval(panelGuardTimer);

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
