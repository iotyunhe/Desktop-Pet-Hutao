import { app, type BrowserWindow } from 'electron';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface SmokeCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface SmokeResult {
  ok: boolean;
  at: string;
  appVersion: string;
  electronVersion: string;
  checks: SmokeCheck[];
  payload?: unknown;
}

export function writeSmokeResult(resultPath: string | null, result: Omit<SmokeResult, 'at' | 'appVersion' | 'electronVersion'>): string {
  const target = resultPath ?? join(app.getPath('userData'), 'smoke-result.json');
  mkdirSync(dirname(target), { recursive: true });

  const payload: SmokeResult = {
    ...result,
    at: new Date().toISOString(),
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron ?? 'unknown'
  };

  writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return target;
}

async function evaluate(window: BrowserWindow, expression: string): Promise<unknown> {
  return window.webContents.executeJavaScript(expression, true);
}

/**
 * 打包后的冒烟测试：确认窗口真的加载了 UI、preload 桥接可用、
 * 渲染层能读到透明的 body 背景。用于在发布前验证 exe 不是「能启动但白屏」。
 */
export async function runWindowSmokeTest(
  window: BrowserWindow,
  resultPath: string | null,
  mainProcessChecks: SmokeCheck[]
): Promise<number> {
  const checks: SmokeCheck[] = [...mainProcessChecks];

  const push = (name: string, ok: boolean, detail?: string): void => {
    checks.push({ name, ok, detail });
  };

  try {
    push('window exists', !window.isDestroyed());
    push('renderer url loaded', Boolean(window.webContents.getURL()), window.webContents.getURL());

    const mounted = (await evaluate(
      window,
      'JSON.stringify({ shell: Boolean(document.querySelector(".pet-shell")), pet: Boolean(document.querySelector(".pet-button")), bubble: Boolean(document.querySelector(".speech-bubble")) })'
    )) as string;
    const mountedState = JSON.parse(mounted) as { shell: boolean; pet: boolean; bubble: boolean };
    push('renderer mounted', mountedState.shell && mountedState.pet, mounted);
    push('speech bubble mounted', mountedState.bubble, mounted);

    const apiReady = await evaluate(
      window,
      'typeof window.huTaoPet?.getSettings === "function" && typeof window.huTaoPet?.browseBilibili === "function"'
    );
    push('preload api bridged', apiReady === true, String(apiReady));

    const transparent = await evaluate(
      window,
      'getComputedStyle(document.body).backgroundColor === "rgba(0, 0, 0, 0)"'
    );
    push('transparent body', transparent === true, String(transparent));

    const panelTitle = await evaluate(
      window,
      'new Promise((resolve) => { window.huTaoPet.getBilibiliStatus().then((status) => resolve(JSON.stringify({ enabled: status.settings.enabled, hasSettings: typeof status.settings.shareIntervalMinutes === "number", shares: Array.isArray(status.recentShares) }))).catch((error) => resolve(String(error))); })'
    );
    const panelState = JSON.parse(String(panelTitle)) as { enabled: boolean; hasSettings: boolean; shares: boolean };
    push('bilibili status ipc', panelState.hasSettings && panelState.shares, String(panelTitle));
  } catch (error) {
    push('smoke test runtime', false, error instanceof Error ? error.message : String(error));
  }

  const ok = checks.every((check) => check.ok);
  const target = writeSmokeResult(resultPath, { ok, checks });
  console.log(`[smoke] result written to ${target}, ok=${ok}`);
  return ok ? 0 : 1;
}

export function defaultSmokeResultPath(userDataDir: string): string {
  return join(userDataDir, 'smoke-result.json');
}

/** 冒烟测试用截图，方便人工确认面板/分享卡的视觉布局。 */
export async function captureWindowToFile(window: BrowserWindow, filePath: string): Promise<void> {
  const image = await window.webContents.capturePage();
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, image.toPNG());
  console.log(`[smoke] screenshot written to ${filePath}`);
}

export async function openCarePanelForCapture(window: BrowserWindow, tab?: string | null): Promise<void> {
  await window.webContents.executeJavaScript('document.querySelector(".menu-button")?.click(); true', true);
  await new Promise((resolve) => setTimeout(resolve, 500));

  if (tab) {
    const applied = await window.webContents.executeJavaScript(
      `(() => {
        const button = document.querySelector('[data-panel-tab=${JSON.stringify(tab)}]');
        if (!button) return false;
        button.click();
        return true;
      })()`,
      true
    );

    if (applied !== true) {
      throw new Error(`找不到面板标签：${tab}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 350));
  }
}

interface BubbleMetrics {
  hidden: boolean;
  width: number;
  height: number;
  textLength: number;
  text: string;
}

async function readBubbleMetrics(window: BrowserWindow): Promise<BubbleMetrics> {
  const raw = await window.webContents.executeJavaScript(
    `(() => {
      const bubble = document.querySelector('.speech-bubble');
      if (!bubble) return null;
      const rect = bubble.getBoundingClientRect();
      return {
        hidden: bubble.hidden,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        textLength: (bubble.textContent || '').length,
        text: (bubble.textContent || '').slice(0, 40)
      };
    })()`,
    true
  );

  if (!raw || typeof raw !== 'object') {
    throw new Error('找不到气泡元素。');
  }

  return raw as BubbleMetrics;
}

/**
 * 长按回归测试：先单击让气泡出现，再长按 1.4 秒，确认
 * 1) 窗口尺寸没有被撑大；2) 长按期间气泡被收起；3) 长按不会误触点击。
 */
export async function runLongPressProbe(window: BrowserWindow): Promise<SmokeCheck[]> {
  const checks: SmokeCheck[] = [];

  try {
    await window.webContents.executeJavaScript(
      `(() => {
        window.__longPressEvents = [];
        const log = (label) => (event) => window.__longPressEvents.push({
          label,
          ts: Math.round(performance.now()),
          pointerId: event.pointerId,
          button: event.button
        });
        const pet = document.querySelector('.pet-button');
        for (const name of ['pointerdown', 'pointerup', 'pointercancel', 'click', 'contextmenu']) {
          pet.addEventListener(name, log('pet:' + name), true);
          document.addEventListener(name, log('doc:' + name), true);
        }
        return true;
      })()`,
      true
    );

    const point = (await window.webContents.executeJavaScript(
      `(() => {
        const rect = document.querySelector('.pet-button').getBoundingClientRect();
        return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
      })()`,
      true
    )) as { x: number; y: number };

    const before = window.getBounds();
    window.webContents.sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y });
    window.webContents.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    window.webContents.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    await new Promise((resolve) => setTimeout(resolve, 200));

    const bubbleBefore = await readBubbleMetrics(window);
    checks.push({
      name: 'longpress probe: click shows bubble',
      ok: bubbleBefore.hidden === false,
      detail: JSON.stringify(bubbleBefore)
    });

    window.webContents.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    await new Promise((resolve) => setTimeout(resolve, 1_400));
    window.webContents.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    await new Promise((resolve) => setTimeout(resolve, 350));

    const after = window.getBounds();
    const bubbleAfter = await readBubbleMetrics(window);
    const events = await window.webContents.executeJavaScript(
      'window.__longPressEvents ? window.__longPressEvents.slice(-16) : []',
      true
    );

    checks.push({
      name: 'longpress keeps window size',
      ok:
        Math.abs(after.width - before.width) <= 4 &&
        Math.abs(after.height - before.height) <= 4 &&
        after.width <= 456 &&
        after.height <= 300,
      detail: `before=${before.width}x${before.height} after=${after.width}x${after.height}`
    });
    checks.push({
      name: 'longpress hides bubble',
      ok: bubbleAfter.hidden === true,
      detail: `${JSON.stringify(bubbleAfter)} events=${JSON.stringify(events)}`
    });
  } catch (error) {
    checks.push({
      name: 'longpress probe',
      ok: false,
      detail: error instanceof Error ? error.message : String(error)
    });
  }

  return checks;
}

/**
 * 直接切到某个动作再截图，用于检查新立绘在真实窗口里的缩放、动画和裁切。
 * 只在 smoke/capture 流程里使用，不改变正常桌面宠物的行为。
 */
export async function captureMoodToFile(
  window: BrowserWindow,
  mood: string,
  filePath: string,
  rendererAssetsDir: string
): Promise<void> {
  const assetMood = mood === 'flustered-pat' ? 'flustered' : mood;
  const fileName = readdirSync(rendererAssetsDir).find(
    (name) => name.startsWith(`hutao-${assetMood}-`) && name.endsWith('.png')
  );

  if (!fileName) {
    throw new Error(`找不到动作素材：hutao-${assetMood}-*.png`);
  }

  const assetUrl = pathToFileURL(join(rendererAssetsDir, fileName)).href;
  const applied = await window.webContents.executeJavaScript(
    `(() => {
      const button = document.querySelector('.pet-button');
      const image = document.querySelector('.pet-image');
      if (!button || !image) return false;
      button.classList.remove('is-pressing');
      button.dataset.mood = ${JSON.stringify(mood)};
      image.src = ${JSON.stringify(assetUrl)};
      return true;
    })()`,
    true
  );

  if (applied !== true) {
    throw new Error('渲染层没有找到桌宠元素。');
  }

  await new Promise((resolve) => setTimeout(resolve, 800));
  await captureWindowToFile(window, filePath);
}
