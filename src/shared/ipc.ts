import type { AiMessageRequest, AiReply, AiSettingsPatch, AiStatus } from './ai';
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

/** 渲染进程可见的完整桌宠 API，由 preload 通过 contextBridge 注入。 */
export interface HuTaoPetApi {
  getSettings: () => Promise<PetSettings>;
  updateSettings: (patch: PetSettingsPatch) => Promise<PetSettings>;
  onSettingsChanged: (listener: (settings: PetSettings) => void) => Unsubscribe;

  getCareProfile: () => Promise<PetCareProfile>;
  performCareAction: (action: CareActionRequest) => Promise<CareActionResult>;
  claimDailyCarePack: () => Promise<CareActionResult>;

  getAiStatus: () => Promise<AiStatus>;
  saveMiniMaxApiKey: (key: string) => Promise<AiStatus>;
  clearMiniMaxApiKey: () => Promise<AiStatus>;
  updateAiSettings: (patch: AiSettingsPatch) => Promise<AiStatus>;
  sendAiMessage: (request: AiMessageRequest) => Promise<AiReply>;
  observeDesktopNow: () => Promise<AiReply>;
  testAiVoice: () => Promise<AiReply>;

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
