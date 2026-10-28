import { app } from 'electron';
import { join } from 'node:path';
import appIconAsset from '../../../resources/icon.png?asset';
import trayIconAsset from '../../../resources/tray.png?asset';

/**
 * 开发时直接用 electron-vite 解析出来的资源路径；
 * 打包后走 extraResources，避免 asar 内的原生图标读取差异。
 */
export function resolveTrayIconPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'tray.png') : trayIconAsset;
}

export function resolveAppIconPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'icon.png') : appIconAsset;
}
