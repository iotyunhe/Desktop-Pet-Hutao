import { app, type BrowserWindow } from 'electron';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import WebSocket from 'ws';
import { IPC, type BilibiliShare } from '../shared';
import type { AiService } from './services/ai/ai-service';
import { OneBotGateway } from './services/qq/onebot-gateway';
import { noopLogger } from './util/logger';

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
 * 大模型自检（`--ai-smoke`）：用真实存档里的 Key 真的打一次接口，
 * 再读一次本机语音。用来给用户确认「配上模型」到底通没通。
 */
export async function runAiSelfCheck(ai: AiService, resultPath: string | null): Promise<number> {
  const checks: SmokeCheck[] = [];
  const status = ai.getStatus();

  checks.push({
    name: 'ai settings',
    ok: /^https?:\/\//.test(status.settings.apiBaseUrl),
    detail: `${status.settings.apiBaseUrl} · ${status.settings.textModel}`
  });
  checks.push({
    name: 'ai api key',
    ok: status.hasApiKey,
    detail: `source=${status.keySource ?? 'none'}`
  });

  const connection = await ai.testConnection();
  checks.push({
    name: 'ai connection',
    ok: connection.ok,
    detail: connection.ok
      ? `${connection.model} · ${connection.latencyMs}ms · ${connection.reply}`
      : connection.error
  });

  const voices = await ai.listVoices();
  checks.push({
    name: 'system voices',
    ok: voices.ok && voices.voices.length > 0,
    detail: voices.ok ? voices.voices.join(', ') : voices.error
  });

  if (status.settings.ttsEngine === 'clone') {
    const probe = await ai.probeCloneVoice();
    checks.push({
      name: 'clone service',
      ok: probe.text.startsWith('克隆音色服务'),
      detail: probe.text
    });
    const voice = await ai.testVoice();
    checks.push({
      name: 'clone voice',
      ok: Boolean(voice.ok && voice.audioBase64),
      detail: voice.ok
        ? `${voice.audioMimeType ?? 'audio/wav'} · ${Math.round((voice.audioBase64?.length ?? 0) / 1024)}KB`
        : voice.error
    });
  }

  const ok = checks.every((check) => check.ok);
  writeSmokeResult(resultPath, { ok, checks });
  return ok ? 0 : 1;
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

interface PanelSnapshot {
  hidden: boolean;
  width: number;
  bodyOpen: boolean;
  mode: string | null;
}

async function readPanelSnapshot(window: BrowserWindow): Promise<PanelSnapshot> {
  const raw = await window.webContents.executeJavaScript(
    `(() => {
      const panel = document.querySelector('.side-panel');
      if (!panel) return null;
      const rect = panel.getBoundingClientRect();
      return {
        hidden: panel.hidden,
        width: Math.round(rect.width),
        bodyOpen: document.body.classList.contains('is-panel-open'),
        mode: document.body.dataset.panelMode || null
      };
    })()`,
    true
  );

  if (!raw || typeof raw !== 'object') {
    throw new Error('找不到侧边面板元素。');
  }

  return raw as PanelSnapshot;
}

async function clickMenuButton(window: BrowserWindow): Promise<void> {
  const clicked = await window.webContents.executeJavaScript(
    `(() => {
      const button = document.querySelector('.menu-button');
      if (!button) return false;
      button.click();
      return true;
    })()`,
    true
  );

  if (clicked !== true) {
    throw new Error('找不到菜单按钮。');
  }

  await new Promise((resolve) => setTimeout(resolve, 600));
}

/**
 * 面板回归测试：打开面板 → 关闭面板 → 打开面板后长按胡桃，
 * 确认窗口宽度会跟着面板展开/收起，不会停留在「宽窗口空面板」状态。
 */
export async function runPanelLifecycleProbe(window: BrowserWindow): Promise<SmokeCheck[]> {
  const checks: SmokeCheck[] = [];
  const baseline = window.getBounds();

  try {
    await clickMenuButton(window);
    const openedBounds = window.getBounds();
    const openedPanel = await readPanelSnapshot(window);

    checks.push({
      name: 'panel opens with content',
      ok:
        openedBounds.width > baseline.width + 80 &&
        openedPanel.hidden === false &&
        openedPanel.bodyOpen === true &&
        openedPanel.width > 80,
      detail: `bounds=${openedBounds.width}x${openedBounds.height} panel=${JSON.stringify(openedPanel)}`
    });

    await clickMenuButton(window);
    const closedBounds = window.getBounds();
    const closedPanel = await readPanelSnapshot(window);

    checks.push({
      name: 'panel close restores width',
      ok:
        Math.abs(closedBounds.width - baseline.width) <= 4 &&
        closedPanel.hidden === true &&
        closedPanel.bodyOpen === false,
      detail: `baseline=${baseline.width} after=${closedBounds.width} panel=${JSON.stringify(closedPanel)}`
    });

    await clickMenuButton(window);
    const point = (await window.webContents.executeJavaScript(
      `(() => {
        const rect = document.querySelector('.pet-button').getBoundingClientRect();
        return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
      })()`,
      true
    )) as { x: number; y: number };

    window.webContents.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    window.webContents.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    await new Promise((resolve) => setTimeout(resolve, 500));

    const afterBounds = window.getBounds();
    const afterPanel = await readPanelSnapshot(window);

    checks.push({
      name: 'longpress closes open panel',
      ok:
        Math.abs(afterBounds.width - baseline.width) <= 4 &&
        afterPanel.hidden === true &&
        afterPanel.bodyOpen === false,
      detail: `baseline=${baseline.width} after=${afterBounds.width} panel=${JSON.stringify(afterPanel)}`
    });

    // 制造「主进程已经展开窗口、渲染层却认为面板关闭」的失同步，验证兜底校正会自动归位。
    await window.webContents.executeJavaScript('window.huTaoPet.setPanelMode("care")', true);
    await new Promise((resolve) => setTimeout(resolve, 2_600));

    const healedBounds = window.getBounds();
    const healedPanel = await readPanelSnapshot(window);

    checks.push({
      name: 'panel desync self-heals',
      ok:
        Math.abs(healedBounds.width - baseline.width) <= 4 &&
        healedPanel.hidden === true &&
        healedPanel.bodyOpen === false,
      detail: `baseline=${baseline.width} after=${healedBounds.width} panel=${JSON.stringify(healedPanel)}`
    });
  } catch (error) {
    checks.push({
      name: 'panel lifecycle probe',
      ok: false,
      detail: error instanceof Error ? error.message : String(error)
    });
  }

  return checks;
}

/**
 * 分享卡回归测试：模拟主进程推送一张分享卡，点击 × 后确认
 * 窗口宽度回到桌宠尺寸，不会留下「宽窗口空面板」。
 */
export async function runShareCardProbe(window: BrowserWindow): Promise<SmokeCheck[]> {
  const checks: SmokeCheck[] = [];
  const baseline = window.getBounds();
  const demoShare: BilibiliShare = {
    id: 'BV1xx411c7mD',
    video: {
      bvid: 'BV1xx411c7mD',
      title: '冒烟测试分享卡',
      upName: '往生堂',
      coverUrl: '',
      durationSeconds: 180,
      viewCount: 12_000,
      danmakuCount: 10,
      publishedAt: new Date().toISOString(),
      category: '鬼畜',
      url: 'https://www.bilibili.com/video/BV1xx411c7mD'
    },
    message: '本堂主逛到一张测试分享卡。',
    reason: '冒烟测试 · 鬼畜 · 1.2万播放',
    mood: 'happy',
    source: 'manual',
    sharedAt: new Date().toISOString()
  };

  try {
    window.webContents.send(IPC.bilibiliShareEvent, demoShare);
    await new Promise((resolve) => setTimeout(resolve, 800));

    const openedBounds = window.getBounds();
    const openedPanel = await readPanelSnapshot(window);
    const hasCard = await window.webContents.executeJavaScript(
      'Boolean(document.querySelector(".share-card"))',
      true
    );

    checks.push({
      name: 'share card opens',
      ok:
        openedBounds.width > baseline.width + 80 &&
        openedPanel.hidden === false &&
        openedPanel.bodyOpen === true &&
        hasCard === true,
      detail: `bounds=${openedBounds.width}x${openedBounds.height} card=${String(hasCard)} panel=${JSON.stringify(openedPanel)}`
    });

    await window.webContents.executeJavaScript('document.querySelector(".share-close")?.click(); true', true);
    await new Promise((resolve) => setTimeout(resolve, 700));

    const closedBounds = window.getBounds();
    const closedPanel = await readPanelSnapshot(window);

    checks.push({
      name: 'share card close restores width',
      ok:
        Math.abs(closedBounds.width - baseline.width) <= 4 &&
        closedPanel.hidden === true &&
        closedPanel.bodyOpen === false,
      detail: `baseline=${baseline.width} after=${closedBounds.width} panel=${JSON.stringify(closedPanel)}`
    });
  } catch (error) {
    checks.push({
      name: 'share card probe',
      ok: false,
      detail: error instanceof Error ? error.message : String(error)
    });
  }

  return checks;
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

/**
 * QQ 板块的通道自检：起一个临时反向 WS 服务，模拟协议端连接、
 * 验证 token 鉴权、API 调用回包和事件派发都能走通。
 */
export async function runQqGatewayProbe(): Promise<SmokeCheck[]> {
  const checks: SmokeCheck[] = [];
  const gateway = new OneBotGateway({
    port: 0,
    accessToken: 'hutao-probe-token',
    logger: noopLogger,
    requestTimeoutMs: 4_000
  });

  let client: WebSocket | null = null;

  try {
    await gateway.start();
    const port = gateway.boundPort;
    checks.push({ name: 'qq gateway listen', ok: port > 0, detail: `127.0.0.1:${port}` });

    const events: unknown[] = [];
    gateway.onEvent((event) => events.push(event));

    client = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { Authorization: 'Bearer hutao-probe-token' }
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('连接反向 WS 超时')), 4_000);
      client?.once('open', () => {
        clearTimeout(timer);
        resolve();
      });
      client?.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });

    client.on('message', (raw) => {
      const payload = JSON.parse(String(raw)) as { action?: string; echo?: string };
      if (payload.action === 'probe_ping' && payload.echo) {
        client?.send(JSON.stringify({ status: 'ok', retcode: 0, data: { pong: 'yes' }, echo: payload.echo }));
      }
    });

    const result = await gateway.call<{ pong?: string }>('probe_ping');
    checks.push({ name: 'qq gateway api call', ok: result?.pong === 'yes', detail: JSON.stringify(result) });

    client.send(
      JSON.stringify({
        post_type: 'message',
        message_type: 'group',
        self_id: 10001,
        group_id: 20002,
        user_id: 30003,
        message: [{ type: 'text', data: { text: '胡桃在吗' } }]
      })
    );

    const eventOk = await waitFor(() => events.length > 0, 2_000);
    checks.push({ name: 'qq gateway event', ok: eventOk, detail: JSON.stringify(events[0] ?? null) });
  } catch (error) {
    checks.push({ name: 'qq gateway probe', ok: false, detail: error instanceof Error ? error.message : String(error) });
  } finally {
    try {
      client?.close();
    } catch {
      // 忽略关闭失败。
    }
    await gateway.stop();
  }

  return checks;
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return predicate();
}
