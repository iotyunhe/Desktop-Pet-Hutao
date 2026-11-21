import { ipcMain } from 'electron';
import {
  IPC,
  isPoint,
  type AccessPolicyPatch,
  type AiMessageRequest,
  type AiSettingsPatch,
  type BilibiliFeedbackRequest,
  type BilibiliSettingsPatch,
  type CareActionRequest,
  type PanelMode,
  type PetSettingsPatch,
  type Point,
  type QqSettingsPatch
} from '../../shared';
import type { CareService } from '../services/care-service';
import type { LocalAccessService } from '../services/access/local-access-service';
import type { AiService } from '../services/ai/ai-service';
import type { QqService } from '../services/qq/qq-service';
import type { BilibiliService } from '../services/bilibili/bilibili-service';
import { isBilibiliBvId } from '../services/bilibili/video';
import type { PetWindowManager } from '../window/window-manager';
import type { TrayController } from '../window/tray';
import type { JsonStore } from '../storage/json-store';
import type { PetSettings } from '../../shared/pet';

export interface IpcDependencies {
  manager: PetWindowManager;
  settings: JsonStore<PetSettings>;
  care: CareService;
  ai: AiService;
  qq: QqService;
  access: LocalAccessService;
  /** 打开本地工作台；没起来就现起一个。 */
  openWorkbench: () => Promise<{ ok: boolean; url?: string; message?: string }>;
  bilibili: BilibiliService;
  tray: TrayController | null;
  onSettingsChanged: (settings: PetSettings) => void;
  onQuit: () => void;
}

const PANEL_MODES: PanelMode[] = ['none', 'care', 'share'];

export function registerIpcHandlers(deps: IpcDependencies): void {
  ipcMain.handle(IPC.settingsGet, () => deps.settings.get());

  ipcMain.handle(IPC.settingsUpdate, (_event, patch: PetSettingsPatch) => {
    const next = deps.manager.updateSettings(patch && typeof patch === 'object' ? patch : {});
    deps.onSettingsChanged(next);
    return next;
  });

  ipcMain.handle(IPC.careGetProfile, () => deps.care.getProfile());

  ipcMain.handle(IPC.carePerformAction, (_event, action: CareActionRequest) => {
    if (!action || typeof action !== 'object' || typeof action.type !== 'string') {
      return deps.care.perform({ type: 'pat' });
    }

    return deps.care.perform(action);
  });

  ipcMain.handle(IPC.careClaimDailyPack, () => deps.care.claimDailyPack());

  ipcMain.handle(IPC.aiGetStatus, () => deps.ai.getStatus());

  ipcMain.handle(IPC.aiSaveKey, (_event, key: unknown) => {
    return deps.ai.saveKey(typeof key === 'string' ? key : '');
  });

  ipcMain.handle(IPC.aiClearKey, () => deps.ai.clearKey());

  ipcMain.handle(IPC.aiUpdateSettings, (_event, patch: AiSettingsPatch) => {
    return deps.ai.updateSettings(patch && typeof patch === 'object' ? patch : {});
  });

  ipcMain.handle(IPC.aiSendMessage, (_event, request: AiMessageRequest) => {
    return deps.ai.sendMessage(request ?? { text: '' });
  });

  ipcMain.handle(IPC.aiObserveDesktop, () => deps.ai.observeDesktop());

  ipcMain.handle(IPC.aiTestVoice, () => deps.ai.testVoice());

  ipcMain.handle(IPC.aiTestConnection, () => deps.ai.testConnection());

  ipcMain.handle(IPC.aiListModels, () => deps.ai.listModels());

  ipcMain.handle(IPC.aiListVoices, () => deps.ai.listVoices());

  ipcMain.handle(IPC.aiProbeCloneVoice, () => deps.ai.probeCloneVoice());

  ipcMain.handle(IPC.qqGetStatus, () => deps.qq.getStatus());

  ipcMain.handle(IPC.qqUpdateSettings, (_event, patch: QqSettingsPatch) => {
    return deps.qq.updateSettings(patch && typeof patch === 'object' ? patch : {});
  });

  ipcMain.handle(IPC.qqConnect, () => deps.qq.connect());

  ipcMain.handle(IPC.qqDisconnect, () => deps.qq.disconnect());

  ipcMain.handle(IPC.qqRefreshGroups, () => deps.qq.refreshGroups());

  ipcMain.handle(IPC.accessGetStatus, () => deps.access.getStatus());

  ipcMain.handle(IPC.accessUpdatePolicy, (_event, patch: unknown) => {
    deps.access.updatePolicy(patch && typeof patch === 'object' ? (patch as AccessPolicyPatch) : {});
    return deps.access.getStatus();
  });

  ipcMain.handle(IPC.accessReadFile, (_event, path: unknown) => {
    return deps.access.readTextFile(typeof path === 'string' ? path : '', 'panel');
  });

  ipcMain.handle(IPC.accessListDirectory, (_event, path: unknown) => {
    return deps.access.listDirectory(typeof path === 'string' ? path : '', 'panel');
  });

  ipcMain.handle(IPC.accessScreenshot, () => deps.access.screenshot('panel'));

  ipcMain.handle(IPC.accessLaunch, (_event, id: unknown) => {
    return deps.access.launch(typeof id === 'string' ? id : '', 'panel');
  });

  ipcMain.handle(IPC.accessRequestCommand, (_event, command: unknown) => {
    return deps.access.requestCommand(typeof command === 'string' ? command : '', 'panel');
  });

  ipcMain.handle(IPC.accessApprove, (_event, id: unknown) => {
    return deps.access.approve(typeof id === 'string' ? id : '', 'panel');
  });

  ipcMain.handle(IPC.accessDeny, (_event, id: unknown) => {
    return deps.access.deny(typeof id === 'string' ? id : '', 'panel');
  });

  ipcMain.handle(IPC.accessClearAudit, () => {
    deps.access.clearAudit();
    return deps.access.getStatus();
  });

  ipcMain.handle(IPC.accessOpenWorkbench, () => deps.openWorkbench());

  ipcMain.handle(IPC.bilibiliGetStatus, () => deps.bilibili.getStatus());

  ipcMain.handle(IPC.bilibiliUpdateSettings, (_event, patch: BilibiliSettingsPatch) => {
    return deps.bilibili.updateSettings(patch && typeof patch === 'object' ? patch : {});
  });

  ipcMain.handle(IPC.bilibiliBrowse, (_event, raw: unknown) => {
    const request = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const excludeBvid = isBilibiliBvId(request.excludeBvid) ? request.excludeBvid : undefined;

    return deps.bilibili.browse({
      source: request.source === 'auto' ? 'auto' : 'manual',
      excludeBvid
    });
  });

  ipcMain.handle(IPC.bilibiliFeedback, (_event, raw: unknown) => {
    const request = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const bvid = typeof request.bvid === 'string' ? request.bvid : '';
    const action = request.action === 'like' || request.action === 'dislike' ? request.action : null;

    if (!isBilibiliBvId(bvid) || !action) {
      return deps.bilibili.getStatus();
    }

    return deps.bilibili.feedback({ bvid, action } as BilibiliFeedbackRequest);
  });

  ipcMain.handle(IPC.bilibiliGetCover, (_event, bvid: unknown) => {
    return deps.bilibili.getCover(typeof bvid === 'string' ? bvid : '');
  });

  ipcMain.handle(IPC.bilibiliOpenVideo, (_event, bvid: unknown) => {
    return deps.bilibili.openVideo(typeof bvid === 'string' ? bvid : '');
  });

  ipcMain.handle(IPC.bilibiliOpenHome, () => deps.bilibili.openHome());

  ipcMain.handle(IPC.bilibiliCopyLink, (_event, bvid: unknown) => {
    return deps.bilibili.copyLink(typeof bvid === 'string' ? bvid : '');
  });

  ipcMain.handle(IPC.bilibiliClearHistory, () => deps.bilibili.clearHistory());

  ipcMain.handle(IPC.dragBegin, (_event, point: Point) => {
    if (isPoint(point)) {
      deps.manager.beginDrag(point);
    }
  });

  ipcMain.handle(IPC.dragMove, (_event, point: Point) => {
    return isPoint(point) ? deps.manager.dragTo(point) : null;
  });

  ipcMain.handle(IPC.dragEnd, () => deps.manager.endDrag());

  ipcMain.handle(IPC.windowMoveBy, (_event, delta: Point) => {
    return isPoint(delta) ? deps.manager.moveBy(delta) : null;
  });

  ipcMain.handle(IPC.windowResetPosition, () => {
    const next = deps.manager.resetPosition();
    deps.onSettingsChanged(next);
    return next;
  });

  ipcMain.handle(IPC.windowSetMousePassthrough, (_event, enabled: unknown) => {
    deps.manager.setMousePassthrough(Boolean(enabled));
  });

  ipcMain.handle(IPC.windowSetPanelMode, (_event, mode: unknown) => {
    const nextMode = PANEL_MODES.includes(mode as PanelMode) ? (mode as PanelMode) : 'none';
    return deps.manager.setPanelMode(nextMode);
  });

  ipcMain.handle(IPC.menuShowContext, () => {
    deps.manager.setMousePassthrough(false);
    deps.tray?.popupForWindow(deps.manager.petWindow);
  });

  ipcMain.handle(IPC.appQuit, () => {
    deps.onQuit();
  });
}
