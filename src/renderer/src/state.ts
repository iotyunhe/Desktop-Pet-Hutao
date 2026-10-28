import type { BilibiliShare, PanelMode, PanelSide, PetCareProfile, PetSettings, AiStatus, BilibiliStatus, Point } from '../../shared';

export type PetMood =
  | 'idle'
  | 'happy'
  | 'curious'
  | 'sleepy'
  | 'pat'
  | 'eat'
  | 'gift'
  | 'proud'
  | 'desk-read'
  | 'desk-tea'
  | 'desk-write'
  | 'walking-left'
  | 'walking-right'
  | 'umbrella-walk-left'
  | 'umbrella-walk-right'
  | 'lantern-wish'
  | 'talisman'
  | 'nap'
  | 'flustered-pat'
  | 'offer-tea'
  | 'boo'
  | 'boo-grin'
  | 'twirl'
  | 'abacus'
  | 'stretch';

export type BurstKind = 'happy' | 'curious' | 'sleepy';
export type PanelTab = 'care' | 'bilibili' | 'ai';

export interface RendererState {
  settings: PetSettings | null;
  careProfile: PetCareProfile | null;
  aiStatus: AiStatus | null;
  bilibiliStatus: BilibiliStatus | null;
  panelMode: PanelMode;
  panelSide: PanelSide;
  panelTab: PanelTab;
  currentShare: BilibiliShare | null;
  shareCoverDataUrl: string | null;
  shareCoverFailed: boolean;
  shareBusy: boolean;
  unreadShare: boolean;
  /** 用户主动点了「去逛逛」/「换一个」，下一次分享必须直接展开卡片。 */
  awaitingManualShare: boolean;
  aiBusy: boolean;
  aiConfigOpen: boolean;
  bilibiliConfigOpen: boolean;
  mood: PetMood;
  dragging: boolean;
  movedDuringDrag: boolean;
  pointerStart: Point | null;
  pointerId: number | null;
  pressStartedAt: number;
  moodBeforePress: PetMood | null;
  lastInteractionAt: number;
  mousePassthrough: boolean | null;
  currentVoice: HTMLAudioElement | null;
  /** 连续摸头计数，用于触发「炸毛护发型」。 */
  patStreak: number;
  lastPatAt: number;
  /** 上一次自动播放特殊空闲动作的时间，避免短时间内重复。 */
  lastSpecialActionAt: number;
  timers: {
    bubble: number;
    burst: number;
    sleep: number;
    roam: number;
    idleComment: number;
    activeMood: number;
    aiObserve: number;
    teaOffer: number;
  };
  roamRunId: number;
}

export const state: RendererState = {
  settings: null,
  careProfile: null,
  aiStatus: null,
  bilibiliStatus: null,
  panelMode: 'none',
  panelSide: 'left',
  panelTab: 'care',
  currentShare: null,
  shareCoverDataUrl: null,
  shareCoverFailed: false,
  shareBusy: false,
  unreadShare: false,
  awaitingManualShare: false,
  aiBusy: false,
  aiConfigOpen: false,
  bilibiliConfigOpen: false,
  mood: 'idle',
  dragging: false,
  movedDuringDrag: false,
  pointerStart: null,
  pointerId: null,
  pressStartedAt: 0,
  moodBeforePress: null,
  lastInteractionAt: Date.now(),
  mousePassthrough: null,
  currentVoice: null,
  patStreak: 0,
  lastPatAt: 0,
  lastSpecialActionAt: 0,
  timers: {
    bubble: 0,
    burst: 0,
    sleep: 0,
    roam: 0,
    idleComment: 0,
    activeMood: 0,
    aiObserve: 0,
    teaOffer: 0
  },
  roamRunId: 0
};

export function isWalkingMood(mood: PetMood): boolean {
  return (
    mood === 'walking-left' ||
    mood === 'walking-right' ||
    mood === 'umbrella-walk-left' ||
    mood === 'umbrella-walk-right'
  );
}

export function isSleepingMood(mood: PetMood): boolean {
  return mood === 'sleepy' || mood === 'nap';
}

export function isSleeping(): boolean {
  return isSleepingMood(state.mood);
}
