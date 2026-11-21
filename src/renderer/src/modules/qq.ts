import type { QqSettings, QqSettingsPatch, QqStatus } from '../../../shared';
import { requireApi } from '../api';
import { state } from '../state';
import { showBubble } from './bubble';
import { refreshPanel } from './panel';

export async function refreshQqStatus(): Promise<void> {
  state.qqStatus = await requireApi().getQqStatus();
  refreshPanel();
}

/** 主进程推送过来的连接状态，直接覆盖并重绘面板。 */
export function applyQqStatus(status: QqStatus): void {
  state.qqStatus = status;
  refreshPanel();
}

const NUMBER_SETTINGS = new Set<keyof QqSettings>([
  'wsPort',
  'nameReplyChance',
  'interjectChance',
  'interjectCooldownMinutes',
  'maxRepliesPer10Minutes'
]);

const BOOLEAN_SETTINGS = new Set<keyof QqSettings>([
  'enabled',
  'replyToAt',
  'quietHoursEnabled'
]);

export async function updateQqSettingFromInput(input: HTMLInputElement): Promise<void> {
  const setting = input.dataset.qqSetting as keyof QqSettings | undefined;
  if (!setting) {
    return;
  }

  const patch: QqSettingsPatch = {};

  if (BOOLEAN_SETTINGS.has(setting)) {
    (patch as Record<string, unknown>)[setting] = input.checked;
  } else if (NUMBER_SETTINGS.has(setting)) {
    (patch as Record<string, unknown>)[setting] = Number(input.value);
  } else if (setting === 'accessToken' || setting === 'selfQq') {
    (patch as Record<string, unknown>)[setting] = input.value;
  } else if (setting === 'quietHoursStart' || setting === 'quietHoursEnd' || setting === 'persona') {
    (patch as Record<string, unknown>)[setting] = input.value;
  } else {
    return;
  }

  state.qqStatus = await requireApi().updateQqSettings(patch);
  refreshPanel();
}

export async function updateQqSettingFromTextArea(textarea: HTMLTextAreaElement): Promise<void> {
  const setting = textarea.dataset.qqSetting;
  if (setting !== 'persona') {
    return;
  }

  state.qqStatus = await requireApi().updateQqSettings({ persona: textarea.value });
  refreshPanel();
}

function currentGroups(): number[] {
  return state.qqStatus?.settings.allowedGroups ?? [];
}

export async function handleQqAction(action: string, target: HTMLElement): Promise<void> {
  const api = requireApi();
  const status = state.qqStatus;

  if (action === 'toggle-config') {
    state.qqConfigOpen = !state.qqConfigOpen;
    refreshPanel();
    return;
  }

  if (action === 'toggle-enabled') {
    state.qqStatus = await api.updateQqSettings({ enabled: !(status?.settings.enabled ?? false) });
    refreshPanel();
    return;
  }

  if (action === 'connect') {
    state.qqStatus = await api.connectQq();
    refreshPanel();
    return;
  }

  if (action === 'disconnect') {
    state.qqStatus = await api.disconnectQq();
    refreshPanel();
    return;
  }

  if (action === 'refresh-groups') {
    const groups = await api.refreshQqGroups();
    if (state.qqStatus) {
      state.qqStatus = { ...state.qqStatus, groups };
    }
    refreshPanel();
    showBubble(groups.length > 0 ? `认到 ${groups.length} 个群，点名字加白名单。` : '还没认到群，先让小号进几个群。', 3000);
    return;
  }

  if (action === 'add-group') {
    const groupId = Number(target.dataset.groupId ?? '');
    if (!Number.isInteger(groupId) || groupId <= 0) {
      return;
    }
    if (currentGroups().includes(groupId)) {
      showBubble('这个群已经在白名单里了。', 2400);
      return;
    }
    state.qqStatus = await api.updateQqSettings({ allowedGroups: [...currentGroups(), groupId] });
    refreshPanel();
    return;
  }

  if (action === 'remove-group') {
    const groupId = Number(target.dataset.groupId ?? '');
    state.qqStatus = await api.updateQqSettings({
      allowedGroups: currentGroups().filter((id) => id !== groupId)
    });
    refreshPanel();
    return;
  }

  if (action === 'add-group-manual') {
    const input = document.querySelector<HTMLInputElement>('.qq-group-input');
    const groupId = Number(input?.value.trim() ?? '');
    if (!Number.isInteger(groupId) || groupId <= 0) {
      showBubble('群号得是数字哦。', 2400);
      return;
    }
    if (!currentGroups().includes(groupId)) {
      state.qqStatus = await api.updateQqSettings({ allowedGroups: [...currentGroups(), groupId] });
    }
    if (input) {
      input.value = '';
    }
    refreshPanel();
  }
}
