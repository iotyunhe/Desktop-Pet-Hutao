import { app, BrowserWindow, screen, type Rectangle } from 'electron';
import {
  PANEL_EXTRA_WIDTH,
  PET_MARGIN,
  PET_WINDOW_BASE_SIZE,
  clamp,
  type PanelLayout,
  type PanelMode,
  type PanelSide,
  type PetSettings,
  type PetSettingsPatch,
  type Point
} from '../../shared';
import type { JsonStore } from '../storage/json-store';

export interface PetWindowManagerOptions {
  settings: JsonStore<PetSettings>;
  preloadPath: string;
  rendererUrl?: string;
  rendererFile: string;
  iconPath?: string;
  /** 启动时是否自动显示（冒烟测试会关掉）。 */
  autoShow: boolean;
  onVisibilityChange?: () => void;
}

/**
 * 负责桌宠窗口的一切几何与行为：透明置顶、拖拽、漫步位移、
 * 缩放、侧边面板展开/收起，以及位置持久化。
 */
export class PetWindowManager {
  private window: BrowserWindow | null = null;
  private dragOffset: Point | null = null;
  private panelMode: PanelMode = 'none';
  private panelSide: PanelSide = 'left';
  private mousePassthrough = false;
  private quitting = false;
  private adjustingBounds = false;

  constructor(private readonly options: PetWindowManagerOptions) {}

  get petWindow(): BrowserWindow | null {
    return this.window;
  }

  getPanelLayout(): PanelLayout {
    return {
      mode: this.panelMode,
      side: this.panelSide
    };
  }

  isVisible(): boolean {
    const window = this.window;
    return window !== null && !window.isDestroyed() && window.isVisible();
  }

  send(channel: string, payload?: unknown): void {
    const window = this.window;
    if (!window || window.isDestroyed()) {
      return;
    }

    window.webContents.send(channel, payload);
  }

  async create(): Promise<BrowserWindow> {
    const size = this.getWindowSize();
    const bounds = this.getInitialBounds(size);

    this.window = new BrowserWindow({
      ...bounds,
      frame: false,
      transparent: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      alwaysOnTop: this.options.settings.get().alwaysOnTop,
      hasShadow: false,
      skipTaskbar: true,
      show: false,
      title: '胡桃桌宠',
      icon: this.options.iconPath,
      maxWidth: PET_WINDOW_BASE_SIZE.width + PANEL_EXTRA_WIDTH,
      maxHeight: PET_WINDOW_BASE_SIZE.height,
      webPreferences: {
        preload: this.options.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    });

    const window = this.window;
    window.setMenu(null);
    window.webContents.setZoomFactor(1);
    void window.webContents.setVisualZoomLevelLimits(1, 1);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => {
      if (url !== window.webContents.getURL()) {
        event.preventDefault();
      }
    });
    this.applyAlwaysOnTop();

    window.once('ready-to-show', () => {
      this.placeWindow();
      if (this.options.autoShow) {
        window.showInactive();
      }
    });

    window.on('close', (event) => {
      if (!this.quitting) {
        event.preventDefault();
        window.hide();
        this.options.onVisibilityChange?.();
      }
    });

    window.on('show', () => this.options.onVisibilityChange?.());
    window.on('hide', () => this.options.onVisibilityChange?.());
    window.on('resize', () => this.enforceWindowSize());

    if (this.options.rendererUrl) {
      await window.loadURL(this.options.rendererUrl);
    } else {
      await window.loadFile(this.options.rendererFile);
    }

    return window;
  }

  setVisible(visible: boolean): void {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }

    if (visible) {
      this.window.showInactive();
    } else {
      this.window.hide();
    }
  }

  toggleVisible(): void {
    this.setVisible(!this.isVisible());
  }

  updateSettings(patch: PetSettingsPatch): PetSettings {
    const previous = this.options.settings.get();
    const next = this.options.settings.update(patch);

    this.applyAlwaysOnTop();
    this.applyLaunchAtLogin();

    if (previous.scale !== next.scale) {
      this.resizeForScale();
    }

    return next;
  }

  applyAlwaysOnTop(): void {
    const { alwaysOnTop } = this.options.settings.get();
    if (!this.window || this.window.isDestroyed()) {
      return;
    }

    this.window.setAlwaysOnTop(alwaysOnTop, 'floating');
    this.window.setVisibleOnAllWorkspaces(alwaysOnTop, {
      visibleOnFullScreen: true
    });
  }

  applyLaunchAtLogin(): void {
    if (!app.isReady()) {
      return;
    }

    app.setLoginItemSettings({
      openAtLogin: this.options.settings.get().launchAtLogin,
      openAsHidden: true
    });
  }

  resetPosition(): PetSettings {
    this.setBounds(this.getDefaultBounds());
    this.savePosition();
    return this.options.settings.get();
  }

  setPanelMode(mode: PanelMode): PanelLayout {
    if (!this.window || this.window.isDestroyed()) {
      this.panelMode = mode;
      return this.getPanelLayout();
    }

    if (this.panelMode === mode) {
      if (mode === 'none') {
        // 状态已经是 none 但窗口可能因异常残留为展开尺寸，这里强制归位。
        const current = this.window.getBounds();
        const petSize = this.getPetSize();
        this.setBounds({ ...petSize, x: current.x, y: current.y });
      }
      return this.getPanelLayout();
    }

    const current = this.window.getBounds();
    const petSize = this.getPetSize();
    const baseX = this.getBaseX(current);
    const { workArea } = screen.getDisplayMatching(current);

    if (mode === 'none') {
      this.panelMode = 'none';
      this.setBounds({
        ...petSize,
        x: baseX,
        y: current.y
      });
      return this.getPanelLayout();
    }

    if (this.panelMode === 'none') {
      const canOpenLeft = baseX - PANEL_EXTRA_WIDTH >= workArea.x;
      const canOpenRight = baseX + petSize.width + PANEL_EXTRA_WIDTH <= workArea.x + workArea.width;
      this.panelSide = canOpenLeft || !canOpenRight ? 'left' : 'right';
    }

    this.panelMode = mode;
    this.setBounds({
      width: petSize.width + PANEL_EXTRA_WIDTH,
      height: petSize.height,
      x: this.panelSide === 'left' ? baseX - PANEL_EXTRA_WIDTH : baseX,
      y: current.y
    });

    return this.getPanelLayout();
  }

  setMousePassthrough(enabled: boolean): void {
    if (!this.window || this.window.isDestroyed() || this.mousePassthrough === enabled) {
      return;
    }

    this.mousePassthrough = enabled;
    this.window.setIgnoreMouseEvents(enabled, {
      forward: true
    });
  }

  beginDrag(point: Point): void {
    const bounds = this.getWindowBounds();
    if (!bounds) {
      this.dragOffset = null;
      return;
    }

    this.dragOffset = {
      x: bounds.x - point.x,
      y: bounds.y - point.y
    };
  }

  dragTo(point: Point): Point | null {
    const bounds = this.getWindowBounds();
    if (!bounds || !this.dragOffset) {
      return null;
    }

    const nextBounds = this.setBounds({
      ...bounds,
      x: Math.round(point.x + this.dragOffset.x),
      y: Math.round(point.y + this.dragOffset.y)
    });

    return nextBounds
      ? {
          x: nextBounds.x,
          y: nextBounds.y
        }
      : null;
  }

  endDrag(): PetSettings {
    this.dragOffset = null;
    this.savePosition();
    return this.options.settings.get();
  }

  moveBy(delta: Point): Point | null {
    const bounds = this.getWindowBounds();
    if (!bounds) {
      return null;
    }

    const nextBounds = this.setBounds({
      ...bounds,
      x: Math.round(bounds.x + delta.x),
      y: Math.round(bounds.y + delta.y)
    });

    if (!nextBounds) {
      return null;
    }

    this.savePosition(nextBounds);
    return {
      x: nextBounds.x,
      y: nextBounds.y
    };
  }

  savePosition(bounds?: Rectangle): void {
    const target = bounds ?? this.getWindowBounds();
    if (!target) {
      return;
    }

    this.options.settings.update({
      lastPosition: {
        x: this.getBaseX(target),
        y: target.y
      }
    });
  }

  markQuitting(): void {
    this.quitting = true;
  }

  destroy(): void {
    this.window?.destroy();
    this.window = null;
  }

  private getPetSize(scale = this.options.settings.get().scale): Pick<Rectangle, 'width' | 'height'> {
    return {
      width: Math.round(PET_WINDOW_BASE_SIZE.width * scale),
      height: Math.round(PET_WINDOW_BASE_SIZE.height * scale)
    };
  }

  private getWindowSize(scale?: number): Pick<Rectangle, 'width' | 'height'> {
    const petSize = this.getPetSize(scale);
    return {
      width: petSize.width + (this.panelMode === 'none' ? 0 : PANEL_EXTRA_WIDTH),
      height: petSize.height
    };
  }

  private getBaseX(bounds: Rectangle): number {
    return this.panelMode !== 'none' && this.panelSide === 'left' ? bounds.x + PANEL_EXTRA_WIDTH : bounds.x;
  }

  private getInitialBounds(size: Pick<Rectangle, 'width' | 'height'>): Rectangle {
    const lastPosition = this.options.settings.get().lastPosition;
    if (lastPosition) {
      return {
        ...size,
        x: lastPosition.x,
        y: lastPosition.y
      };
    }

    return this.getDefaultBounds(size);
  }

  private getDefaultBounds(size = this.getWindowSize()): Rectangle {
    const { workArea } = screen.getPrimaryDisplay();
    return {
      ...size,
      x: Math.round(workArea.x + workArea.width - size.width - PET_MARGIN),
      y: Math.round(workArea.y + workArea.height - size.height - PET_MARGIN)
    };
  }

  private placeWindow(): void {
    this.setBounds(this.getInitialBounds(this.getWindowSize()));
  }

  private getWindowBounds(): Rectangle | null {
    const window = this.window;
    if (!window || window.isDestroyed()) {
      return null;
    }

    return window.getBounds();
  }

  /** 无论什么原因触发 resize，都把窗口拉回当前面板模式对应的尺寸。 */
  private enforceWindowSize(): void {
    const window = this.window;
    if (!window || window.isDestroyed() || this.adjustingBounds) {
      return;
    }

    const expected = this.getWindowSize();
    const actual = window.getBounds();
    if (actual.width === expected.width && actual.height === expected.height) {
      return;
    }

    this.adjustingBounds = true;
    try {
      window.setBounds({ ...actual, width: expected.width, height: expected.height }, false);
    } finally {
      this.adjustingBounds = false;
    }
  }

  private setBounds(bounds: Rectangle): Rectangle | null {
    if (!this.window || this.window.isDestroyed()) {
      return null;
    }

    const nextBounds = this.constrainBounds(bounds);
    this.window.setBounds(nextBounds, false);
    return nextBounds;
  }

  private constrainBounds(bounds: Rectangle): Rectangle {
    const display = screen.getDisplayMatching(bounds);
    const { workArea } = display;
    // 硬上限：即使外部误传了异常 bounds，窗口也不会被撑成一大块透明区域。
    const maxWidth = PET_WINDOW_BASE_SIZE.width + PANEL_EXTRA_WIDTH;
    const maxHeight = PET_WINDOW_BASE_SIZE.height;
    const width = Math.min(bounds.width, workArea.width, maxWidth);
    const height = Math.min(bounds.height, workArea.height, maxHeight);

    return {
      width,
      height,
      x: Math.round(clamp(bounds.x, workArea.x, workArea.x + workArea.width - width)),
      y: Math.round(clamp(bounds.y, workArea.y, workArea.y + workArea.height - height))
    };
  }

  private resizeForScale(): void {
    const current = this.getWindowBounds();
    if (!current) {
      return;
    }

    const baseX = this.getBaseX(current);
    const petSize = this.getPetSize();
    const nextBounds = this.setBounds({
      width: petSize.width + (this.panelMode === 'none' ? 0 : PANEL_EXTRA_WIDTH),
      height: petSize.height,
      x: this.panelMode !== 'none' && this.panelSide === 'left' ? baseX - PANEL_EXTRA_WIDTH : baseX,
      y: current.y
    });

    if (nextBounds) {
      this.savePosition(nextBounds);
    }
  }
}
