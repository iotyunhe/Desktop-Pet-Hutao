import type { BilibiliBrowsingEvent, BilibiliSettings, BilibiliSettingsPatch, BilibiliShare } from '../../../shared';
import { requireApi } from '../api';
import { truncateText } from '../../../shared/format';
import { randomItem } from '../dom';
import { isWalkingMood, state } from '../state';
import { showBubble, showBurst } from './bubble';
import { playTwirl } from './gestures';
import { BROWSING_LINES } from './lines';
import { playWalkingMood, setMood, setTemporaryMood } from './mood';
import { closePanel, refreshPanel, showShareCard, toggleCarePanel } from './panel';
import { noteInteraction, scheduleRoam, stopRoam } from './roam';

const BROWSING_TIMEOUT_MS = 15_000;

function playBrowsingReaction(): void {
  stopRoam();
  noteInteraction();
  playWalkingMood('right');
  showBubble(randomItem(BROWSING_LINES), 3200);

  // 逛站失败时不会有 share 事件，超时后让胡桃自己走回来，避免一直保持走路姿势。
  window.clearTimeout(state.timers.activeMood);
  state.timers.activeMood = window.setTimeout(() => {
    if (isWalkingMood(state.mood)) {
      setMood('idle');
      scheduleRoam();
    }
  }, BROWSING_TIMEOUT_MS);
}

export async function refreshBilibiliStatus(): Promise<void> {
  state.bilibiliStatus = await requireApi().getBilibiliStatus();
  refreshPanel();
}

/** 逛站开始：自动逛或托盘发起时，让胡桃有个「出门」的动作。 */
export function handleBrowsingEvent(event: BilibiliBrowsingEvent): void {
  if (event.source === 'manual') {
    // 面板里点「去逛逛」时渲染层已经在播动画，这里不重复。
    if (state.shareBusy) {
      return;
    }

    // 托盘发起的逛站：回来时直接展开分享卡。
    state.awaitingManualShare = true;
    window.setTimeout(() => {
      state.awaitingManualShare = false;
    }, 20_000);
  }

  playBrowsingReaction();
}

async function loadShareCover(share: BilibiliShare): Promise<void> {
  try {
    const result = await requireApi().getBilibiliCover(share.id);
    if (state.currentShare?.id !== share.id) {
      return;
    }

    if (result.ok && result.dataUrl) {
      state.shareCoverDataUrl = result.dataUrl;
      state.shareCoverFailed = false;
    } else {
      state.shareCoverFailed = true;
    }
  } catch {
    if (state.currentShare?.id === share.id) {
      state.shareCoverFailed = true;
    }
  }

  refreshPanel();
}

async function presentShare(share: BilibiliShare): Promise<void> {
  await showShareCard(share);
  stopRoam();
  noteInteraction();
  setTemporaryMood(share.mood, 2600);
  showBubble(share.message, 4000);
  showBurst('happy');
  void loadShareCover(share);
}

/**
 * 主进程推来的分享：
 * - 面板没开时，直接把卡片展开给用户看；
 * - 用户正在看养成面板时，只提示 + 亮小红点，避免抢走面板。
 */
export async function handlePushedShare(share: BilibiliShare): Promise<void> {
  const manualRequest = state.awaitingManualShare;
  state.awaitingManualShare = false;

  if (!manualRequest && state.panelMode === 'care') {
    state.currentShare = share;
    state.unreadShare = true;
    refreshPanel();
    stopRoam();
    noteInteraction();
    setTemporaryMood('curious', 2200);
    showBubble(`B 站有新鲜事：${truncateText(share.video.title, 18)}（点右下角来看）`, 5200);
    showBurst('curious');
    return;
  }

  await presentShare(share);
}

export async function browseBilibiliNow(): Promise<void> {
  if (state.shareBusy) {
    return;
  }

  state.shareBusy = true;
  state.awaitingManualShare = true;
  refreshPanel();
  playBrowsingReaction();

  try {
    const result = await requireApi().browseBilibili({ source: 'manual' });
    // 成功时主进程会推送 share 事件并自动展开卡片；这里只处理失败提示。
    if (!result.ok) {
      state.awaitingManualShare = false;
      showBubble(result.message, 3600);
      setTemporaryMood('curious', 1800);
    }
  } catch (error) {
    state.awaitingManualShare = false;
    showBubble(error instanceof Error ? error.message : 'B 站暂时连不上。', 3200);
  } finally {
    state.shareBusy = false;
    await refreshBilibiliStatus();
  }
}

async function rerollShare(): Promise<void> {
  const current = state.currentShare;
  if (!current || state.shareBusy) {
    return;
  }

  state.shareBusy = true;
  refreshPanel();
  playBrowsingReaction();

  try {
    const result = await requireApi().browseBilibili({
      source: 'manual',
      excludeBvid: current.id
    });

    if (!result.ok) {
      showBubble(result.message, 3600);
    }
  } finally {
    state.shareBusy = false;
    refreshPanel();
  }
}

export async function handleShareAction(action: string): Promise<void> {
  const api = requireApi();
  const share = state.currentShare;

  if (action === 'open-home') {
    await api.openBilibiliHome();
    return;
  }

  if (!share) {
    return;
  }

  switch (action) {
    case 'open': {
      const ok = await api.openBilibiliVideo(share.id);
      if (!ok) {
        showBubble('链接没打开成功，复制一下手动看吧。', 2800);
      }
      return;
    }
    case 'copy': {
      const ok = await api.copyBilibiliLink(share.id);
      showBubble(ok ? '链接已经复制到剪贴板啦。' : '复制失败，稍后再试。', 2400);
      return;
    }
    case 'reroll': {
      await rerollShare();
      return;
    }
    case 'like': {
      state.bilibiliStatus = await api.sendBilibiliFeedback({ bvid: share.id, action: 'like' });
      playTwirl();
      showBubble('眼光不错，本堂主记住了。', 2600);
      refreshPanel();
      return;
    }
    case 'dislike': {
      state.bilibiliStatus = await api.sendBilibiliFeedback({ bvid: share.id, action: 'dislike' });
      showBubble('记下了，这类以后少推。', 2600);
      await closePanel();
      return;
    }
    case 'dismiss': {
      await closePanel();
      scheduleRoam();
      return;
    }
    default:
      return;
  }
}

export async function openRecentShare(bvid: string): Promise<void> {
  const share = state.bilibiliStatus?.recentShares.find((item) => item.id === bvid);
  if (!share) {
    return;
  }

  await presentShare(share);
}

export async function updateBilibiliSettingFromInput(input: HTMLInputElement | HTMLTextAreaElement): Promise<void> {
  const setting = input.dataset.bilibiliSetting as keyof BilibiliSettings | undefined;
  if (!setting) {
    return;
  }

  const patch: BilibiliSettingsPatch = {};

  if (setting === 'enabled' || setting === 'quietHoursEnabled' || setting === 'allowLongVideos' || setting === 'aiCommentary') {
    patch[setting] = (input as HTMLInputElement).checked;
  } else if (setting === 'shareIntervalMinutes' || setting === 'dailyShareLimit') {
    patch[setting] = Number(input.value);
  } else if (setting === 'quietHoursStart' || setting === 'quietHoursEnd') {
    patch[setting] = input.value;
  } else if (setting === 'interests') {
    patch.interests = input.value
      .split(/[,，、\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  state.bilibiliStatus = await requireApi().updateBilibiliSettings(patch);
  refreshPanel();
}

export async function clearBilibiliHistory(): Promise<void> {
  state.bilibiliStatus = await requireApi().clearBilibiliHistory();
  state.currentShare = null;
  showBubble('逛站记录清空了，重新认识一下 B 站也不错。', 2600);
  refreshPanel();
}

export async function openCurrentShare(): Promise<void> {
  const share = state.currentShare;
  if (!share) {
    await toggleCarePanel();
    return;
  }

  await presentShare(share);
}
