import type { AccessPolicyPatch, AccessStatus } from '../../../shared';
import { requireApi } from '../api';
import { refreshPanel } from './panel';
import { showBubble } from './bubble';
import { state } from '../state';

/** 拉一次权限状态；面板打开或收到推送时都会走它。 */
export async function refreshAccessStatus(): Promise<void> {
  try {
    state.accessStatus = await requireApi().getAccessStatus();
  } catch {
    state.accessStatus = null;
  }
}

export function applyAccessStatus(status: AccessStatus): void {
  state.accessStatus = status;
  if (state.panelMode === 'care' && state.panelTab === 'access') {
    refreshPanel();
  }
}

const BOOLEAN_SETTINGS = new Set([
  'enabled',
  'allowRead',
  'allowScreenshot',
  'allowLaunch',
  'allowShell'
]);

const NUMBER_SETTINGS = new Set(['maxOpsPerHour', 'shellTimeoutMs']);

/** 面板上的开关/文本框改动都收敛到这里，统一走 updateAccessPolicy。 */
export async function updateAccessSettingFromInput(
  input: HTMLInputElement | HTMLSelectElement
): Promise<void> {
  const setting = input.dataset.accessSetting;
  if (!setting) {
    return;
  }

  const patch: AccessPolicyPatch = {};
  if (BOOLEAN_SETTINGS.has(setting)) {
    (patch as Record<string, unknown>)[setting] = (input as HTMLInputElement).checked;
  } else if (NUMBER_SETTINGS.has(setting)) {
    (patch as Record<string, unknown>)[setting] = Number(input.value);
  }

  await saveAccessPatch(patch);
}

export async function updateAccessSettingFromTextArea(area: HTMLTextAreaElement): Promise<void> {
  const setting = area.dataset.accessSetting;
  if (!setting) {
    return;
  }

  const lines = area.value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (setting === 'readRoots') {
    await saveAccessPatch({ readRoots: lines });
    return;
  }

  if (setting === 'launchAllowlist') {
    await saveAccessPatch({
      launchAllowlist: lines.map((line, index) => {
        const [label, target] = line.split('|').map((part) => (part ?? '').trim());
        const kind = /^https?:\/\//i.test(target ?? '') ? 'url' : 'app';
        return {
          id: `item-${index + 1}`,
          label: label || target || line,
          target: target || label || line,
          kind
        };
      })
    });
  }
}

async function saveAccessPatch(patch: AccessPolicyPatch): Promise<void> {
  try {
    state.accessStatus = await requireApi().updateAccessPolicy(patch);
  } catch {
    showBubble('权限没保存上，等下再试试？');
  }

  if (state.panelMode === 'care' && state.panelTab === 'access') {
    refreshPanel();
  }
}

export async function handleAccessAction(action: string, target: HTMLElement): Promise<void> {
  const api = requireApi();

  switch (action) {
    case 'toggle-config':
      state.accessConfigOpen = !state.accessConfigOpen;
      refreshPanel();
      return;
    case 'open-workbench': {
      const result = await api.openWorkbench();
      showBubble(result.ok ? '工作台开好啦，去浏览器看看～' : result.message ?? '工作台没打开。');
      return;
    }
    case 'approve': {
      const id = target.dataset.pendingId ?? '';
      const result = await api.approveAccessRequest(id);
      if (result.ok && result.data) {
        showBubble(`跑完了，退出码 ${result.data.exitCode}。`);
      } else {
        showBubble(result.message ?? '这条申请没法执行。');
      }
      await refreshAccessStatus();
      refreshPanel();
      return;
    }
    case 'deny': {
      await api.denyAccessRequest(target.dataset.pendingId ?? '');
      await refreshAccessStatus();
      refreshPanel();
      return;
    }
    case 'screenshot': {
      const result = await api.takeAccessScreenshot();
      showBubble(result.ok ? '看到屏幕啦，已经交给模型看过了。' : result.message ?? '截不了屏。');
      await refreshAccessStatus();
      return;
    }
    case 'launch': {
      const result = await api.launchAccessEntry(target.dataset.entryId ?? '');
      if (!result.ok) {
        showBubble(result.message ?? '打不开这个。');
      }
      await refreshAccessStatus();
      return;
    }
    case 'clear-audit':
      state.accessStatus = await api.clearAccessAudit();
      refreshPanel();
      return;
    default:
      return;
  }
}
