import { execFile } from 'node:child_process';
import { desktopCapturer, screen } from 'electron';
import type { AccessScreenshot } from '../../../shared/access';
import type { ShellResult } from './local-access-service';

const MAX_SCREENSHOT_BYTES = 1_500_000;
const SHELL_OUTPUT_LIMIT = 4000;

/**
 * 主屏幕截图：缩到 1280 宽以内，返回 PNG base64。
 * 只在主人显式打开「看屏幕截图」后才会被调用。
 */
export async function capturePrimaryScreen(): Promise<AccessScreenshot | null> {
  const display = screen.getPrimaryDisplay();
  const width = Math.min(1280, Math.round(display.size.width));
  const height = Math.round((width / Math.max(1, display.size.width)) * display.size.height);

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height }
  });
  const source = sources[0];
  if (!source) {
    return null;
  }

  let image = source.thumbnail;
  let png = image.toPNG();
  if (png.byteLength > MAX_SCREENSHOT_BYTES) {
    image = image.resize({ width: Math.round(width / 2), quality: 'good' });
    png = image.toPNG();
  }

  const size = image.getSize();
  return {
    mimeType: 'image/png',
    base64: png.toString('base64'),
    width: size.width,
    height: size.height,
    note: '这是主人当前屏幕的截图，会发送给模型服务。'
  };
}

/**
 * 执行一条 PowerShell 命令。只由 LocalAccessService 在主人审批后调用。
 */
export function runPowerShellCommand(command: string, timeoutMs: number): Promise<ShellResult> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const output = `${stdout ?? ''}${stderr ?? ''}`.trim();
        const truncated = output.length > SHELL_OUTPUT_LIMIT;
        const exitCode =
          error && typeof (error as { code?: unknown }).code === 'number' ? Number((error as { code: number }).code) : error ? 1 : 0;

        resolve({
          exitCode,
          output: truncated ? output.slice(0, SHELL_OUTPUT_LIMIT) : output,
          truncated
        });
      }
    );
  });
}
