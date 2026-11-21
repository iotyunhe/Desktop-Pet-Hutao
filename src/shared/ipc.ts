import type {
  AccessCommandResult,
  AccessListing,
  AccessPendingEntry,
  AccessPolicyPatch,
  AccessReadResult,
  AccessResult,
  AccessScreenshot,
  AccessStatus,
  WorkbenchOpenResult
} from './access';
import type {
  AiConnectionTest,
  AiMessageRequest,
  AiModelList,
  AiReply,
  AiSettingsPatch,
  AiStatus
} from './ai';
import type {
  BilibiliBrowsingEvent,
  BilibiliBrowseRequest,
  BilibiliBrowseResult,
  BilibiliCoverResult,
  BilibiliFeedbackRequest,
  BilibiliSettingsPatch,
  BilibiliShare,
  BilibiliStatus
} from './bilibili';
import type { CareActionRequest, CareActionResult, PetCareProfile } from './care';
import type { PanelLayout, PanelMode, PetSettings, PetSettingsPatch, Point } from './pet';
import type { QqGroupInfo, QqSettingsPatch, QqStatus } from './qq';

/** 所有 IPC 通道名的唯一来源，main / preload 共用。 */
export const IPC = {
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  settingsChanged: 'settings:changed',

  careGetProfile: 'care:get-profile',
  carePerformAction: 'care:perform-action',
  careClaimDailyPack: 'care:claim-daily-pack',

  aiGetStatus: 'ai:get-status',
  aiSaveKey: 'ai:save-key',
  aiClearKey: 'ai:clear-key',
  aiUpdateSettings: 'ai:update-settings',
  aiSendMessage: 'ai:send-message',
  aiObserveDesktop: 'ai:observe-desktop',
  aiTestVoice: 'ai:test-voice',
  aiTestConnection: 'ai:test-connection',
  aiListModels: 'ai:list-models',
  aiListVoices: 'ai:list-voices',
  aiProbeCloneVoice: 'ai:probe-clone-voice',

  qqGetStatus: 'qq:get-status',
  qqUpdateSettings: 'qq:update-settings',
  qqConnect: 'qq:connect',
  qqDisconnect: 'qq:disconnect',
  qqRefreshGroups: 'qq:refresh-groups',
  qqStatusEvent: 'qq:status',

  accessGetStatus: 'access:get-status',
  accessUpdatePolicy: 'access:update-policy',
  accessReadFile: 'access:read-file',
  accessListDirectory: 'access:list-directory',
  accessScreenshot: 'access:screenshot',
  accessLaunch: 'access:launch',
  accessRequestCommand: 'access:request-command',
  accessApprove: 'access:approve',
  accessDeny: 'access:deny',
  accessClearAudit: 'access:clear-audit',
  accessOpenWorkbench: 'access:open-workbench',
  accessChanged: 'access:changed',

  bilibiliGetStatus: 'bilibili:get-status',
  bilibiliUpdateSettings: 'bilibili:update-settings',
  bilibiliBrowse: 'bilibili:browse',
  bilibiliFeedback: 'bilibili:feedback',
  bilibiliGetCover: 'bilibili:get-cover',
  bilibiliOpenVideo: 'bilibili:open-video',
  bilibiliOpenHome: 'bilibili:open-home',
  bilibiliCopyLink: 'bilibili:copy-link',
  bilibiliClearHistory: 'bilibili:clear-history',
  bilibiliBrowsingEvent: 'bilibili:browsing',
  bilibiliShareEvent: 'bilibili:share',

  dragBegin: 'window:drag-begin',
  dragMove: 'window:drag-move',
  dragEnd: 'window:drag-end',
  windowMoveBy: 'window:move-by',
  windowResetPosition: 'window:reset-position',
  windowSetMousePassthrough: 'window:set-mouse-passthrough',
  windowSetPanelMode: 'window:set-panel-mode',

  menuShowContext: 'app:show-context-menu',
  appQuit: 'app:quit'
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

export type Unsubscribe = () => void;

export interface TtsVoiceListResult {
  ok: boolean;
  voices: string[];
  error?: string;
}

/** 渲染进程可见的完整桌宠 API，由 preload 通过 contextBridge 注入。 */
export interface HuTaoPetApi {
  getSettings: () => Promise<PetSettings>;
  updateSettings: (patch: PetSettingsPatch) => Promise<PetSettings>;
  onSettingsChanged: (listener: (settings: PetSettings) => void) => Unsubscribe;

  getCareProfile: () => Promise<PetCareProfile>;
  performCareAction: (action: CareActionRequest) => Promise<CareActionResult>;
  claimDailyCarePack: () => Promise<CareActionResult>;

  getAiStatus: () => Promise<AiStatus>;
  saveApiKey: (key: string) => Promise<AiStatus>;
  clearApiKey: () => Promise<AiStatus>;
  updateAiSettings: (patch: AiSettingsPatch) => Promise<AiStatus>;
  sendAiMessage: (request: AiMessageRequest) => Promise<AiReply>;
  observeDesktopNow: () => Promise<AiReply>;
  testAiVoice: () => Promise<AiReply>;
  testAiConnection: () => Promise<AiConnectionTest>;
  listAiModels: () => Promise<AiModelList>;
  listAiVoices: () => Promise<TtsVoiceListResult>;
  probeCloneVoice: () => Promise<AiReply>;

  getQqStatus: () => Promise<QqStatus>;
  updateQqSettings: (patch: QqSettingsPatch) => Promise<QqStatus>;
  connectQq: () => Promise<QqStatus>;
  disconnectQq: () => Promise<QqStatus>;
  refreshQqGroups: () => Promise<QqGroupInfo[]>;
  onQqStatus: (listener: (status: QqStatus) => void) => Unsubscribe;

  getAccessStatus: () => Promise<AccessStatus>;
  updateAccessPolicy: (patch: AccessPolicyPatch) => Promise<AccessStatus>;
  readAccessFile: (path: string) => Promise<AccessResult<AccessReadResult>>;
  listAccessDirectory: (path: string) => Promise<AccessResult<AccessListing>>;
  takeAccessScreenshot: () => Promise<AccessResult<AccessScreenshot>>;
  launchAccessEntry: (id: string) => Promise<AccessResult<{ label: string; target: string }>>;
  requestAccessCommand: (command: string) => Promise<AccessResult<AccessPendingEntry>>;
  approveAccessRequest: (id: string) => Promise<AccessResult<AccessCommandResult>>;
  denyAccessRequest: (id: string) => Promise<boolean>;
  clearAccessAudit: () => Promise<AccessStatus>;
  openWorkbench: () => Promise<WorkbenchOpenResult>;
  onAccessChanged: (listener: (status: AccessStatus) => void) => Unsubscribe;

  getBilibiliStatus: () => Promise<BilibiliStatus>;
  updateBilibiliSettings: (patch: BilibiliSettingsPatch) => Promise<BilibiliStatus>;
  browseBilibili: (request?: BilibiliBrowseRequest) => Promise<BilibiliBrowseResult>;
  sendBilibiliFeedback: (request: BilibiliFeedbackRequest) => Promise<BilibiliStatus>;
  getBilibiliCover: (bvid: string) => Promise<BilibiliCoverResult>;
  openBilibiliVideo: (bvid: string) => Promise<boolean>;
  openBilibiliHome: () => Promise<boolean>;
  copyBilibiliLink: (bvid: string) => Promise<boolean>;
  clearBilibiliHistory: () => Promise<BilibiliStatus>;
  onBilibiliBrowsing: (listener: (event: BilibiliBrowsingEvent) => void) => Unsubscribe;
  onBilibiliShare: (listener: (share: BilibiliShare) => void) => Unsubscribe;

  beginDrag: (point: Point) => Promise<void>;
  dragTo: (point: Point) => Promise<Point | null>;
  endDrag: () => Promise<PetSettings>;
  moveBy: (delta: Point) => Promise<Point | null>;
  resetPosition: () => Promise<PetSettings>;
  setMousePassthrough: (enabled: boolean) => Promise<void>;
  setPanelMode: (mode: PanelMode) => Promise<PanelLayout>;

  showContextMenu: () => Promise<void>;
  quit: () => Promise<void>;
}

declare global {
  interface Window {
    huTaoPet?: HuTaoPetApi;
  }
}
