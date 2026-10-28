export interface Point {
  x: number;
  y: number;
}

export interface PetSettings {
  alwaysOnTop: boolean;
  launchAtLogin: boolean;
  roamEnabled: boolean;
  scale: number;
  lastPosition: Point | null;
}

export type PetSettingsPatch = Partial<PetSettings>;

/** 右侧扩展区域的用途：养成/AI 面板，或 B 站分享卡。 */
export type PanelMode = 'none' | 'care' | 'share';
export type PanelSide = 'left' | 'right';

export interface PanelLayout {
  mode: PanelMode;
  side: PanelSide;
}

export const MIN_SCALE = 0.6;
export const MAX_SCALE = 1;

export const PET_WINDOW_BASE_SIZE = {
  width: 220,
  height: 300
} as const;

/** 桌宠与屏幕边缘的安全距离。 */
export const PET_MARGIN = 24;

/** 打开侧边面板时额外增加的窗口宽度。 */
export const PANEL_EXTRA_WIDTH = 236;

export const DEFAULT_SETTINGS: PetSettings = {
  alwaysOnTop: true,
  launchAtLogin: false,
  roamEnabled: true,
  scale: 0.75,
  lastPosition: null
};
