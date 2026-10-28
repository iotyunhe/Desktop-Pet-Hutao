import type { BilibiliShare, PanelMode } from '../../../shared';
import { getApi } from '../api';
import { getElements } from '../dom';
import { state, type PanelTab } from '../state';
import { renderCarePanel, renderShareCard } from './panel-views';
import { resetMousePassthrough, updateMousePassthrough } from './passthrough';
import { stopRoam } from './roam';

export function refreshPanel(resetScroll = false): void {
  const elements = getElements();
  const { panel } = elements;
  const currentBody = panel.querySelector<HTMLElement>('.panel-body');
  const previousScroll = resetScroll ? 0 : (currentBody?.scrollTop ?? 0);

  document.body.classList.toggle('is-panel-open', state.panelMode !== 'none');
  document.body.dataset.panelSide = state.panelSide;
  document.body.dataset.panelMode = state.panelMode;

  elements.menuBadge.hidden = !state.unreadShare;
  elements.menuButton.classList.toggle('has-badge', state.unreadShare);
  panel.hidden = state.panelMode === 'none';

  if (state.panelMode === 'care') {
    panel.innerHTML = renderCarePanel(state);
  } else if (state.panelMode === 'share' && state.currentShare) {
    panel.innerHTML = `<div class="panel-body is-share">${renderShareCard(
      state.currentShare,
      state.shareCoverDataUrl,
      state.shareCoverFailed,
      state.shareBusy
    )}</div>`;
  } else {
    panel.innerHTML = '';
  }

  const nextBody = panel.querySelector<HTMLElement>('.panel-body');
  if (nextBody) {
    nextBody.scrollTop = previousScroll;
  }
}

export function setPanelTab(tab: PanelTab): void {
  if (state.panelTab === tab) {
    return;
  }

  state.panelTab = tab;
  refreshPanel(true);
}

export async function setPanelMode(mode: PanelMode): Promise<void> {
  const api = getApi();
  if (!api) {
    return;
  }

  if (mode !== 'none') {
    stopRoam();
    state.mousePassthrough = false;
    void api.setMousePassthrough(false);
  }

  const layout = await api.setPanelMode(mode);
  state.panelMode = layout.mode;
  state.panelSide = layout.side;

  if (layout.mode === 'share') {
    state.unreadShare = false;
  }

  refreshPanel();

  if (layout.mode === 'none') {
    resetMousePassthrough();
    updateMousePassthrough(null);
  }
}

export async function toggleCarePanel(): Promise<void> {
  await setPanelMode(state.panelMode === 'care' ? 'none' : 'care');
}

export async function closePanel(): Promise<void> {
  if (state.panelMode !== 'none') {
    await setPanelMode('none');
  }
}

/** 展示一张 B 站分享卡（调用方随后负责加载封面）。 */
export async function showShareCard(share: BilibiliShare): Promise<void> {
  state.currentShare = share;
  state.shareCoverDataUrl = null;
  state.shareCoverFailed = false;
  await setPanelMode('share');
  refreshPanel();
}
