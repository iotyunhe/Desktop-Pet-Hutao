import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  IPC,
  type AiMessageRequest,
  type AiReply,
  type AiSettingsPatch,
  type AiStatus,
  type BilibiliBrowsingEvent,
  type BilibiliBrowseRequest,
  type BilibiliBrowseResult,
  type BilibiliCoverResult,
  type BilibiliFeedbackRequest,
  type BilibiliSettingsPatch,
  type BilibiliShare,
  type BilibiliStatus,
  type CareActionRequest,
  type CareActionResult,
  type HuTaoPetApi,
  type PanelLayout,
  type PanelMode,
  type PetCareProfile,
  type PetSettings,
  type PetSettingsPatch,
  type Point
} from '../shared';

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T): void => {
    listener(payload);
  };

  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const api: HuTaoPetApi = {
  getSettings: () => invoke<PetSettings>(IPC.settingsGet),
  updateSettings: (patch: PetSettingsPatch) => invoke<PetSettings>(IPC.settingsUpdate, patch),
  onSettingsChanged: (listener) => subscribe<PetSettings>(IPC.settingsChanged, listener),

  getCareProfile: () => invoke<PetCareProfile>(IPC.careGetProfile),
  performCareAction: (action: CareActionRequest) => invoke<CareActionResult>(IPC.carePerformAction, action),
  claimDailyCarePack: () => invoke<CareActionResult>(IPC.careClaimDailyPack),

  getAiStatus: () => invoke<AiStatus>(IPC.aiGetStatus),
  saveMiniMaxApiKey: (key: string) => invoke<AiStatus>(IPC.aiSaveKey, key),
  clearMiniMaxApiKey: () => invoke<AiStatus>(IPC.aiClearKey),
  updateAiSettings: (patch: AiSettingsPatch) => invoke<AiStatus>(IPC.aiUpdateSettings, patch),
  sendAiMessage: (request: AiMessageRequest) => invoke<AiReply>(IPC.aiSendMessage, request),
  observeDesktopNow: () => invoke<AiReply>(IPC.aiObserveDesktop),
  testAiVoice: () => invoke<AiReply>(IPC.aiTestVoice),

  getBilibiliStatus: () => invoke<BilibiliStatus>(IPC.bilibiliGetStatus),
  updateBilibiliSettings: (patch: BilibiliSettingsPatch) =>
    invoke<BilibiliStatus>(IPC.bilibiliUpdateSettings, patch),
  browseBilibili: (request?: BilibiliBrowseRequest) =>
    invoke<BilibiliBrowseResult>(IPC.bilibiliBrowse, request ?? { source: 'manual' }),
  sendBilibiliFeedback: (request: BilibiliFeedbackRequest) =>
    invoke<BilibiliStatus>(IPC.bilibiliFeedback, request),
  getBilibiliCover: (bvid: string) => invoke<BilibiliCoverResult>(IPC.bilibiliGetCover, bvid),
  openBilibiliVideo: (bvid: string) => invoke<boolean>(IPC.bilibiliOpenVideo, bvid),
  openBilibiliHome: () => invoke<boolean>(IPC.bilibiliOpenHome),
  copyBilibiliLink: (bvid: string) => invoke<boolean>(IPC.bilibiliCopyLink, bvid),
  clearBilibiliHistory: () => invoke<BilibiliStatus>(IPC.bilibiliClearHistory),
  onBilibiliBrowsing: (listener) => subscribe<BilibiliBrowsingEvent>(IPC.bilibiliBrowsingEvent, listener),
  onBilibiliShare: (listener) => subscribe<BilibiliShare>(IPC.bilibiliShareEvent, listener),

  beginDrag: (point: Point) => invoke<void>(IPC.dragBegin, point),
  dragTo: (point: Point) => invoke<Point | null>(IPC.dragMove, point),
  endDrag: () => invoke<PetSettings>(IPC.dragEnd),
  moveBy: (delta: Point) => invoke<Point | null>(IPC.windowMoveBy, delta),
  resetPosition: () => invoke<PetSettings>(IPC.windowResetPosition),
  setMousePassthrough: (enabled: boolean) => invoke<void>(IPC.windowSetMousePassthrough, enabled),
  setPanelMode: (mode: PanelMode) => invoke<PanelLayout>(IPC.windowSetPanelMode, mode),

  showContextMenu: () => invoke<void>(IPC.menuShowContext),
  quit: () => invoke<void>(IPC.appQuit)
};

contextBridge.exposeInMainWorld('huTaoPet', api);
