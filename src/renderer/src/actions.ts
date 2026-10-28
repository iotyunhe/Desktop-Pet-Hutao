import { CARE_ITEM_IDS, type CareActionType, type CareItemId } from '../../shared';
import { getApi } from './api';
import { state } from './state';
import { claimDailyPack, performCareAction } from './modules/care';
import {
  handleAiAction,
  handleAiChatSubmit,
  updateAiSettingFromInput,
  updateAiSettingFromTextArea
} from './modules/ai';
import {
  browseBilibiliNow,
  clearBilibiliHistory,
  handleShareAction,
  openRecentShare,
  updateBilibiliSettingFromInput
} from './modules/bilibili';
import { refreshPanel, setPanelTab } from './modules/panel';

function isCareItemId(value: string | undefined): value is CareItemId {
  return Boolean(value && (CARE_ITEM_IDS as string[]).includes(value));
}

function showContextMenu(): void {
  void getApi()?.showContextMenu();
}

/**
 * 侧边面板使用事件委托：面板内容每次重渲染，监听器只绑在容器上。
 */
export function bindPanelInteractions(panel: HTMLElement): void {
  panel.addEventListener('click', (event) => {
    const target = event.target as Element | null;

    const tab = target?.closest<HTMLButtonElement>('[data-panel-tab]')?.dataset.panelTab;
    if (tab === 'care' || tab === 'bilibili' || tab === 'ai') {
      event.preventDefault();
      event.stopPropagation();
      setPanelTab(tab);
      return;
    }

    const aiButton = target?.closest<HTMLButtonElement>('[data-ai-action]');
    if (aiButton?.dataset.aiAction) {
      event.preventDefault();
      event.stopPropagation();
      void handleAiAction(aiButton.dataset.aiAction);
      return;
    }

    const bilibiliButton = target?.closest<HTMLButtonElement>('[data-bilibili-action]');
    if (bilibiliButton?.dataset.bilibiliAction) {
      event.preventDefault();
      event.stopPropagation();
      const action = bilibiliButton.dataset.bilibiliAction;

      if (action === 'browse') {
        void browseBilibiliNow();
      } else if (action === 'toggle-config') {
        state.bilibiliConfigOpen = !state.bilibiliConfigOpen;
        refreshPanel();
      } else if (action === 'clear-history') {
        void clearBilibiliHistory();
      } else if (action === 'open-share') {
        const bvid = bilibiliButton.dataset.bvid;
        if (bvid) {
          void openRecentShare(bvid);
        }
      } else {
        void handleShareAction(action);
      }
      return;
    }

    const careButton = target?.closest<HTMLButtonElement>('[data-care-action]');
    if (!careButton?.dataset.careAction) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const action = careButton.dataset.careAction;
    const rawItemId = careButton.dataset.careItem;
    const itemId = isCareItemId(rawItemId) ? rawItemId : undefined;

    if (action === 'daily') {
      void claimDailyPack();
    } else if (action === 'pat' || action === 'rest' || action === 'feed' || action === 'gift') {
      void performCareAction(action as CareActionType, itemId);
    }
  });

  panel.addEventListener('change', (event) => {
    const target = event.target as Element | null;

    const bilibiliInput = target?.closest<HTMLInputElement | HTMLTextAreaElement>('[data-bilibili-setting]');
    if (bilibiliInput) {
      event.preventDefault();
      event.stopPropagation();
      void updateBilibiliSettingFromInput(bilibiliInput);
      return;
    }

    const textarea = target?.closest<HTMLTextAreaElement>('textarea[data-ai-setting]');
    if (textarea) {
      event.preventDefault();
      event.stopPropagation();
      void updateAiSettingFromTextArea(textarea);
      return;
    }

    const input = target?.closest<HTMLInputElement>('input[data-ai-setting]');
    if (!input) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void updateAiSettingFromInput(input);
  });

  panel.addEventListener('submit', (event) => {
    const form = (event.target as Element | null)?.closest<HTMLFormElement>('.ai-chat-form');
    if (!form) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void handleAiChatSubmit(form);
  });

  panel.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation();
    showContextMenu();
  });
}
