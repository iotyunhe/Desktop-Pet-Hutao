import { Menu, Tray, nativeImage, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import type { BilibiliSettings } from '../../shared/bilibili';
import type { PetSettings, PetSettingsPatch } from '../../shared/pet';
import type { JsonStore } from '../storage/json-store';
import { resolveTrayIconPath } from './assets';

export interface TrayControllerOptions {
  settings: JsonStore<PetSettings>;
  bilibiliSettings: JsonStore<BilibiliSettings>;
  isWindowVisible: () => boolean;
  onToggleVisible: () => void;
  onUpdateSettings: (patch: PetSettingsPatch) => void;
  onResetPosition: () => void;
  onBrowseBilibili: () => void;
  onToggleBilibili: (enabled: boolean) => void;
  onQuit: () => void;
}

export class TrayController {
  private tray: Tray | null = null;

  constructor(private readonly options: TrayControllerOptions) {}

  create(): void {
    if (this.tray) {
      return;
    }

    const iconPath = resolveTrayIconPath();
    const icon = nativeImage.createFromPath(iconPath);
    this.tray = new Tray(icon.isEmpty() ? iconPath : icon.resize({ width: 16, height: 16, quality: 'best' }));
    this.tray.setToolTip('胡桃桌宠');
    this.tray.on('click', () => this.popup());
    this.tray.on('right-click', () => this.popup());
    this.tray.on('double-click', () => this.options.onToggleVisible());
    this.refresh();
  }

  refresh(): void {
    this.tray?.setContextMenu(this.buildMenu());
  }

  /** 在桌宠窗口上右键时，复用同一份菜单。 */
  popupForWindow(window: BrowserWindow | null): void {
    if (!window || window.isDestroyed()) {
      return;
    }

    this.buildMenu().popup({ window });
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }

  private popup(): void {
    this.tray?.popUpContextMenu(this.buildMenu());
  }

  private buildMenu(): Menu {
    const settings = this.options.settings.get();
    const bilibili = this.options.bilibiliSettings.get();
    const visible = this.options.isWindowVisible();
    const template: MenuItemConstructorOptions[] = [
      {
        label: visible ? '隐藏胡桃' : '显示胡桃',
        click: () => this.options.onToggleVisible()
      },
      { type: 'separator' },
      {
        label: '总在最前',
        type: 'checkbox',
        checked: settings.alwaysOnTop,
        click: (item) => this.options.onUpdateSettings({ alwaysOnTop: item.checked })
      },
      {
        label: '自由漫步',
        type: 'checkbox',
        checked: settings.roamEnabled,
        click: (item) => this.options.onUpdateSettings({ roamEnabled: item.checked })
      },
      {
        label: '开机自启',
        type: 'checkbox',
        checked: settings.launchAtLogin,
        click: (item) => this.options.onUpdateSettings({ launchAtLogin: item.checked })
      },
      {
        label: '缩放',
        submenu: [0.6, 0.75, 0.9, 1].map((scale) => ({
          label: `${Math.round(scale * 100)}%`,
          type: 'radio' as const,
          checked: Math.abs(settings.scale - scale) < 0.01,
          click: () => this.options.onUpdateSettings({ scale })
        }))
      },
      {
        label: '重置位置',
        click: () => this.options.onResetPosition()
      },
      { type: 'separator' },
      {
        label: '去 B 站逛一圈',
        click: () => this.options.onBrowseBilibili()
      },
      {
        label: 'B 站自动分享',
        type: 'checkbox',
        checked: bilibili.enabled,
        click: (item) => this.options.onToggleBilibili(item.checked)
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => this.options.onQuit()
      }
    ];

    return Menu.buildFromTemplate(template);
  }
}
