import { app, clipboard, nativeImage, shell } from 'electron';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IPC, type PetSettings } from '../shared';
import { registerIpcHandlers } from './ipc/register-ipc';
import { AiService } from './services/ai/ai-service';
import { ChatClient } from './services/ai/chat-client';
import { DesktopObserver } from './services/ai/desktop-observer';
import { SystemTts } from './services/ai/system-tts';
import { CloneTtsClient } from './services/ai/clone-tts';
import { QqService } from './services/qq/qq-service';
import { BilibiliClient } from './services/bilibili/bilibili-client';
import { BilibiliService } from './services/bilibili/bilibili-service';
import { ContentCurator } from './services/bilibili/content-curator';
import { CareService } from './services/care-service';
import {
  captureMoodToFile,
  captureWindowToFile,
  openCarePanelForCapture,
  runAiSelfCheck,
  runLongPressProbe,
  runPanelLifecycleProbe,
  runQqGatewayProbe,
  runShareCardProbe,
  runWindowSmokeTest,
  writeSmokeResult,
  type SmokeCheck
} from './smoke';
import { AiSettingsStore, LlmKeyStore } from './storage/ai-store';
import { AccessSettingsStore } from './storage/access-store';
import { LocalAccessService } from './services/access/local-access-service';
import { capturePrimaryScreen, runPowerShellCommand } from './services/access/platform-access';
import { WorkbenchServer, resolveWorkbenchPage } from './workbench/server';
import { runAccessProbe, runWorkbenchProbe } from './smoke-access';
import { BilibiliHistoryStore, BilibiliSettingsStore } from './storage/bilibili-store';
import { CareProfileStore } from './storage/profile-store';
import { QqSettingsStore } from './storage/qq-store';
import { SettingsStore } from './storage/settings-store';
import { createLogger } from './util/logger';
import { PetWindowManager } from './window/window-manager';
import { TrayController } from './window/tray';
import { resolveAppIconPath, resolveTrayIconPath } from './window/assets';

const argv = process.argv;
const smokeTest = argv.includes('--smoke-test');
const bilibiliSmoke = argv.includes('--bilibili-smoke');
// AI 自检要用真实存档（要读已存的 API Key），所以不重定向 userData。
const aiSmoke = argv.includes('--ai-smoke');
const isSmokeRun = smokeTest || bilibiliSmoke;
const smokeResultArg = argv.find((arg) => arg.startsWith('--smoke-result='));
const smokeResultPath = smokeResultArg ? smokeResultArg.slice('--smoke-result='.length) : null;
const captureArg = argv.find((arg) => arg.startsWith('--capture='));
const capturePath = captureArg ? captureArg.slice('--capture='.length) : null;
const captureMoodArg = argv.find((arg) => arg.startsWith('--capture-mood='));
const captureMood = captureMoodArg ? captureMoodArg.slice('--capture-mood='.length) : null;
const captureTabArg = argv.find((arg) => arg.startsWith('--capture-tab='));
const captureTab = captureTabArg ? captureTabArg.slice('--capture-tab='.length) : null;
const openWorkbenchOnStart = argv.includes('--open-workbench');

if (isSmokeRun) {
  // 冒烟测试使用独立 userData，不污染真实桌宠的存档。
  app.setPath('userData', join(tmpdir(), `hutao-smoke-${process.pid}`));
}

let manager: PetWindowManager | null = null;
let tray: TrayController | null = null;
let quitting = false;

function notifySettingsChanged(next: PetSettings): void {
  manager?.send(IPC.settingsChanged, next);
  tray?.refresh();
}

function quitApp(): void {
  if (quitting) {
    return;
  }

  quitting = true;
  manager?.markQuitting();
  app.quit();
}

async function bootstrap(): Promise<void> {
  await app.whenReady();
  app.setAppUserModelId('local.hutao.desktoppet');

  const userDataDir = app.getPath('userData');
  const logger = createLogger(userDataDir);

  process.on('uncaughtException', (error) => logger.error('uncaughtException', error));
  process.on('unhandledRejection', (reason) => logger.error('unhandledRejection', reason));

  const settings = new SettingsStore(userDataDir);
  settings.load();

  const careProfile = new CareProfileStore(userDataDir);
  careProfile.load();

  const aiSettings = new AiSettingsStore(userDataDir);
  aiSettings.load();
  const keys = new LlmKeyStore(() => userDataDir);

  const qqSettings = new QqSettingsStore(userDataDir);
  qqSettings.load();

  const bilibiliSettings = new BilibiliSettingsStore(userDataDir);
  bilibiliSettings.load();
  const bilibiliHistory = new BilibiliHistoryStore(userDataDir);
  bilibiliHistory.load();

  const chatClient = new ChatClient({
    baseUrl: () => aiSettings.get().apiBaseUrl
  });
  const observer = new DesktopObserver();
  const cloneTts = new CloneTtsClient({ baseUrl: () => aiSettings.get().ttsApiUrl });
  const aiService = new AiService({
    settings: aiSettings,
    keys,
    client: chatClient,
    observer,
    tts: new SystemTts(),
    cloneTts,
    logger
  });

  if (aiSmoke) {
    const exitCode = await runAiSelfCheck(aiService, smokeResultPath);
    app.exit(exitCode);
    return;
  }

  const accessSettings = new AccessSettingsStore(userDataDir);
  accessSettings.load();
  const accessService = new LocalAccessService({
    getPolicy: () => accessSettings.get(),
    savePolicy: (policy) => accessSettings.replace(policy),
    userDataDir,
    logger,
    captureScreen: capturePrimaryScreen,
    runShell: runPowerShellCommand,
    openPath: (target) => shell.openPath(target),
    openExternal: (url) => shell.openExternal(url),
    onChange: () => manager?.send(IPC.accessChanged, accessService.getStatus())
  });

  const qqService = new QqService({
    settings: qqSettings,
    ai: aiService,
    access: accessService,
    logger
  });
  const careService = new CareService(careProfile);

  const bilibiliClient = new BilibiliClient({
    cookie: process.env.HUTAO_BILIBILI_COOKIE?.trim() || null
  });
  const bilibiliService = new BilibiliService({
    settings: bilibiliSettings,
    history: bilibiliHistory,
    client: bilibiliClient,
    curator: new ContentCurator(),
    logger,
    commentary: (video, reason) =>
      bilibiliSettings.get().aiCommentary ? aiService.writeVideoCommentary(video, reason) : Promise.resolve(null),
    onBrowsing: (event) => manager?.send(IPC.bilibiliBrowsingEvent, event),
    onShare: (share) => manager?.send(IPC.bilibiliShareEvent, share),
    openExternal: (url) => shell.openExternal(url),
    copyText: (text) => clipboard.writeText(text)
  });

  manager = new PetWindowManager({
    settings,
    preloadPath: join(__dirname, '../preload/index.cjs'),
    rendererUrl: process.env.ELECTRON_RENDERER_URL,
    rendererFile: join(__dirname, '../renderer/index.html'),
    iconPath: resolveAppIconPath(),
    autoShow: !isSmokeRun || Boolean(capturePath),
    onVisibilityChange: () => tray?.refresh()
  });

  const workbench = new WorkbenchServer({
    access: accessService,
    qq: qqService,
    ai: aiService,
    logger,
    appVersion: app.getVersion(),
    findPageFile: () => {
      const file = resolveWorkbenchPage(app.getAppPath(), process.resourcesPath, app.isPackaged);
      return existsSync(file) ? file : null;
    },
    browseBilibili: () => {
      void bilibiliService.browse({ source: 'manual' });
    }
  });

  const openWorkbench = async (): Promise<{ ok: boolean; url?: string; message?: string }> => {
    const url = workbench.url() ?? (await workbench.start());
    if (!url) {
      return { ok: false, message: '工作台没能启动，看看日志里有没有端口被占用。' };
    }

    await shell.openExternal(url);
    return { ok: true, url };
  };

  tray = new TrayController({
    settings,
    bilibiliSettings,
    isWindowVisible: () => manager?.isVisible() ?? false,
    onToggleVisible: () => {
      manager?.toggleVisible();
      tray?.refresh();
    },
    onUpdateSettings: (patch) => {
      const next = manager?.updateSettings(patch);
      if (next) {
        notifySettingsChanged(next);
      }
    },
    onResetPosition: () => {
      const next = manager?.resetPosition();
      if (next) {
        notifySettingsChanged(next);
      }
    },
    onBrowseBilibili: () => {
      void bilibiliService.browse({ source: 'manual' });
    },
    onToggleBilibili: (enabled) => {
      bilibiliService.updateSettings({ enabled });
      tray?.refresh();
    },
    onOpenWorkbench: () => {
      void openWorkbench();
    },
    onQuit: () => quitApp()
  });

  registerIpcHandlers({
    manager,
    settings,
    care: careService,
    ai: aiService,
    qq: qqService,
    access: accessService,
    openWorkbench,
    bilibili: bilibiliService,
    tray,
    onSettingsChanged: notifySettingsChanged,
    onQuit: quitApp
  });

  qqService.onStatus((status) => manager?.send(IPC.qqStatusEvent, status));

  await manager.create();
  manager.applyLaunchAtLogin();

  if (smokeTest) {
    const trayIcon = nativeImage.createFromPath(resolveTrayIconPath());
    const storeChecks: SmokeCheck[] = [
      { name: 'settings file', ok: existsSync(join(userDataDir, 'settings.json')), detail: userDataDir },
      { name: 'care profile file', ok: existsSync(join(userDataDir, 'profile.json')) },
      { name: 'bilibili settings file', ok: existsSync(join(userDataDir, 'bilibili-settings.json')) },
      { name: 'qq settings file', ok: existsSync(join(userDataDir, 'qq-settings.json')) },
      { name: 'access settings file', ok: existsSync(join(userDataDir, 'access-settings.json')) },
      { name: 'tray icon', ok: !trayIcon.isEmpty(), detail: resolveTrayIconPath() },
      { name: 'app icon', ok: !nativeImage.createFromPath(resolveAppIconPath()).isEmpty(), detail: resolveAppIconPath() }
    ];

    const panelChecks = await runPanelLifecycleProbe(manager.petWindow!);
    const shareCardChecks = await runShareCardProbe(manager.petWindow!);
    const longPressChecks = await runLongPressProbe(manager.petWindow!);
    const qqChecks = await runQqGatewayProbe();
    const accessChecks = await runAccessProbe();
    const workbenchChecks = await runWorkbenchProbe(
      existsSync(resolveWorkbenchPage(app.getAppPath(), process.resourcesPath, app.isPackaged))
        ? resolveWorkbenchPage(app.getAppPath(), process.resourcesPath, app.isPackaged)
        : null
    );
    const exitCode = await runWindowSmokeTest(manager.petWindow!, smokeResultPath, [
      ...storeChecks,
      ...panelChecks,
      ...shareCardChecks,
      ...longPressChecks,
      ...qqChecks,
      ...accessChecks,
      ...workbenchChecks
    ]);

    if (exitCode === 0 && capturePath && captureMood) {
      try {
        await captureMoodToFile(
          manager.petWindow!,
          captureMood,
          capturePath,
          join(__dirname, '../renderer/assets')
        );
      } catch (error) {
        logger.warn('动作截图失败', error instanceof Error ? error.message : error);
      }
    } else if (exitCode === 0 && capturePath) {
      try {
        await openCarePanelForCapture(manager.petWindow!, captureTab);
        await captureWindowToFile(manager.petWindow!, capturePath);
      } catch (error) {
        logger.warn('冒烟截图失败', error instanceof Error ? error.message : error);
      }
    }

    bilibiliService.dispose();
    app.exit(exitCode);
    return;
  }

  if (bilibiliSmoke) {
    const result = await bilibiliService.browse({ source: 'manual' });
    const target = writeSmokeResult(smokeResultPath, {
      ok: result.ok,
      checks: [{ name: 'bilibili browse', ok: result.ok, detail: result.message }],
      payload: result.share ?? { error: result.error }
    });

    if (result.ok && capturePath) {
      // 等渲染层收到 share 事件、展开分享卡并取回封面。
      await new Promise((resolve) => setTimeout(resolve, 1800));
      try {
        await captureWindowToFile(manager.petWindow!, capturePath);
      } catch (error) {
        logger.warn('分享卡截图失败', error instanceof Error ? error.message : error);
      }
    }

    logger.info('B 站冒烟测试完成', { target, ok: result.ok });
    bilibiliService.dispose();
    app.exit(result.ok ? 0 : 1);
    return;
  }

  tray.create();
  bilibiliService.start();
  if (qqSettings.get().enabled) {
    void qqService.connect();
  }
  if (openWorkbenchOnStart) {
    void openWorkbench();
  }
  logger.info('胡桃桌宠启动完成', {
    version: app.getVersion(),
    scale: settings.get().scale,
    bilibiliEnabled: bilibiliSettings.get().enabled,
    qqEnabled: qqSettings.get().enabled
  });

  app.on('before-quit', () => {
    manager?.markQuitting();
    manager?.savePosition();
    bilibiliService.dispose();
    void qqService.dispose();
    void workbench.stop();
  });
}

if (!isSmokeRun && !aiSmoke) {
  const hasLock = app.requestSingleInstanceLock();

  if (!hasLock) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      manager?.setVisible(true);
    });
    void bootstrap();
  }
} else {
  void bootstrap();
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && quitting) {
    app.quit();
  }
});

app.on('activate', () => {
  manager?.setVisible(true);
});
