import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  IPC,
  type AccessCommandResult,
  type AccessListing,
  type AccessPendingEntry,
  type AccessPolicyPatch,
  type AccessReadResult,
  type AccessResult,
  type AccessScreenshot,
  type AccessStatus,
  type WorkbenchOpenResult,
  type AiConnectionTest,
  type AiMessageRequest,
  type AiModelList,
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
  type Point,
  type QqGroupInfo,
  type QqSettingsPatch,
  type QqStatus,
  type TtsVoiceListResult
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
  saveApiKey: (key: string) => invoke<AiStatus>(IPC.aiSaveKey, key),
  clearApiKey: () => invoke<AiStatus>(IPC.aiClearKey),
  updateAiSettings: (patch: AiSettingsPatch) => invoke<AiStatus>(IPC.aiUpdateSettings, patch),
  sendAiMessage: (request: AiMessageRequest) => invoke<AiReply>(IPC.aiSendMessage, request),
  observeDesktopNow: () => invoke<AiReply>(IPC.aiObserveDesktop),
  testAiVoice: () => invoke<AiReply>(IPC.aiTestVoice),
  testAiConnection: () => invoke<AiConnectionTest>(IPC.aiTestConnection),
  listAiModels: () => invoke<AiModelList>(IPC.aiListModels),
  listAiVoices: () => invoke<TtsVoiceListResult>(IPC.aiListVoices),

  getQqStatus: () => invoke<QqStatus>(IPC.qqGetStatus),
  updateQqSettings: (patch: QqSettingsPatch) => invoke<QqStatus>(IPC.qqUpdateSettings, patch),
  connectQq: () => invoke<QqStatus>(IPC.qqConnect),
  disconnectQq: () => invoke<QqStatus>(IPC.qqDisconnect),
  refreshQqGroups: () => invoke<QqGroupInfo[]>(IPC.qqRefreshGroups),
  onQqStatus: (listener) => subscribe<QqStatus>(IPC.qqStatusEvent, listener),

  getAccessStatus: () => invoke<AccessStatus>(IPC.accessGetStatus),
  updateAccessPolicy: (patch: AccessPolicyPatch) => invoke<AccessStatus>(IPC.accessUpdatePolicy, patch),
  readAccessFile: (path: string) => invoke<AccessResult<AccessReadResult>>(IPC.accessReadFile, path),
  listAccessDirectory: (path: string) =>
    invoke<AccessResult<AccessListing>>(IPC.accessListDirectory, path),
  takeAccessScreenshot: () => invoke<AccessResult<AccessScreenshot>>(IPC.accessScreenshot),
  launchAccessEntry: (id: string) =>
    invoke<AccessResult<{ label: string; target: string }>>(IPC.accessLaunch, id),
  requestAccessCommand: (command: string) =>
    invoke<AccessResult<AccessPendingEntry>>(IPC.accessRequestCommand, command),
  approveAccessRequest: (id: string) =>
    invoke<AccessResult<AccessCommandResult>>(IPC.accessApprove, id),
  denyAccessRequest: (id: string) => invoke<boolean>(IPC.accessDeny, id),
  clearAccessAudit: () => invoke<AccessStatus>(IPC.accessClearAudit),
  openWorkbench: () => invoke<WorkbenchOpenResult>(IPC.accessOpenWorkbench),
  onAccessChanged: (listener) => subscribe<AccessStatus>(IPC.accessChanged, listener),

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
