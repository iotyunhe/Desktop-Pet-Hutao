import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DEFAULT_ACCESS_POLICY, type AccessPolicy, type AccessScreenshot } from '../shared/access';
import { DEFAULT_AI_SETTINGS, type AiStatus } from '../shared/ai';
import { DEFAULT_QQ_SETTINGS, type QqStatus } from '../shared/qq';
import { LocalAccessService } from './services/access/local-access-service';
import type { AiService } from './services/ai/ai-service';
import type { QqService } from './services/qq/qq-service';
import { WorkbenchServer } from './workbench/server';
import { noopLogger } from './util/logger';
import type { SmokeCheck } from './smoke';

function makePolicy(root: string): AccessPolicy {
  return {
    ...DEFAULT_ACCESS_POLICY,
    enabled: true,
    allowRead: true,
    readRoots: [root],
    allowScreenshot: true,
    allowLaunch: true,
    launchAllowlist: [
      { id: 'site', label: '示例站点', target: 'https://example.com', kind: 'url' }
    ],
    allowShell: true,
    shellTimeoutMs: 3000,
    maxOpsPerHour: 60,
    workbenchPort: 0,
    workbenchToken: 'smoke-token'
  };
}

function makeAccess(root: string, policy: AccessPolicy, extra: { runShell?: () => Promise<{ exitCode: number; output: string; truncated: boolean }> } = {}): LocalAccessService {
  let current = policy;

  return new LocalAccessService({
    getPolicy: () => current,
    savePolicy: (next) => {
      current = next;
      return current;
    },
    userDataDir: root,
    logger: noopLogger,
    captureScreen: async (): Promise<AccessScreenshot> => ({
      mimeType: 'image/png',
      base64: 'c21va2U=',
      width: 1,
      height: 1,
      note: 'smoke'
    }),
    openPath: async () => '',
    openExternal: async () => undefined,
    runShell: extra.runShell ?? (async () => ({ exitCode: 0, output: 'smoke-ok', truncated: false }))
  });
}

/**
 * 权限内核自检：路径守卫、开关、限流、命令审批与审计都要走一遍。
 */
export async function runAccessProbe(): Promise<SmokeCheck[]> {
  const checks: SmokeCheck[] = [];
  const root = mkdtempSync(join(tmpdir(), 'hutao-access-probe-'));
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'notes.txt'), '胡桃的便签', 'utf8');

  const access = makeAccess(root, makePolicy(root));

  const okRead = access.readTextFile(join(root, 'notes.txt'));
  checks.push({
    name: 'access read inside root',
    ok: okRead.ok && String((okRead.data as { content: string }).content).includes('胡桃'),
    detail: okRead.ok ? 'ok' : okRead.reason
  });

  const outsideDir = mkdtempSync(join(tmpdir(), 'hutao-access-outside-'));
  const outsideFile = join(outsideDir, 'secret.txt');
  writeFileSync(outsideFile, '不该看见的内容', 'utf8');

  const outside = access.readTextFile(outsideFile);
  checks.push({ name: 'access deny outside root', ok: !outside.ok && outside.reason === 'path-outside', detail: outside.reason ?? 'ok' });

  const traversal = access.readTextFile(join(root, '..', 'anything.txt'));
  checks.push({ name: 'access deny traversal', ok: !traversal.ok, detail: traversal.reason ?? 'ok' });

  const listing = access.listDirectory(root);
  checks.push({
    name: 'access list directory',
    ok: listing.ok && (listing.data as { entries: Array<{ name: string }> }).entries.some((entry) => entry.name === 'notes.txt'),
    detail: listing.ok ? 'ok' : listing.reason
  });

  const launch = await access.launch('site');
  checks.push({ name: 'access launch allowlist', ok: launch.ok, detail: launch.ok ? 'ok' : (launch.reason ?? '') });

  const blockedLaunch = await access.launch('missing');
  checks.push({ name: 'access launch unknown id', ok: !blockedLaunch.ok, detail: blockedLaunch.reason ?? 'ok' });

  const requested = access.requestCommand('echo hutao');
  const pendingId = requested.ok ? (requested.data as { id: string }).id : '';
  checks.push({
    name: 'access command needs approval',
    ok: requested.ok && access.getStatus().pending.length === 1,
    detail: requested.ok ? 'queued' : requested.reason
  });

  const approved = pendingId ? await access.approve(pendingId, 'smoke') : null;
  const approvedOutput = approved?.ok ? approved.data?.output : undefined;
  checks.push({
    name: 'access command approved runs',
    ok: Boolean(approved?.ok) && approvedOutput === 'smoke-ok' && access.getStatus().pending.length === 0,
    detail: approved?.ok ? (approvedOutput ?? '') : (approved?.reason ?? 'none')
  });

  const requestedAgain = access.requestCommand('echo second');
  const secondId = requestedAgain.ok ? (requestedAgain.data as { id: string }).id : '';
  const denied = secondId ? access.deny(secondId, 'smoke') : false;
  checks.push({ name: 'access command deny', ok: denied, detail: denied ? 'denied' : 'failed' });

  checks.push({
    name: 'access audit trail',
    ok: access.getStatus().audit.length > 0 && existsSync(access.getAuditPath()),
    detail: `${access.getStatus().audit.length} 条`
  });

  const closed = makeAccess(root, { ...makePolicy(root), enabled: false });
  const closedRead = closed.readTextFile(join(root, 'notes.txt'));
  checks.push({
    name: 'access disabled blocks everything',
    ok: !closedRead.ok && closedRead.reason === 'not-allowed',
    detail: closedRead.reason ?? 'ok'
  });

  const limited = makeAccess(root, { ...makePolicy(root), maxOpsPerHour: 1 });
  limited.readTextFile(join(root, 'notes.txt'));
  const limitedRead = limited.readTextFile(join(root, 'notes.txt'));
  checks.push({
    name: 'access rate limit',
    ok: !limitedRead.ok && limitedRead.reason === 'rate-limited',
    detail: limitedRead.reason ?? 'ok'
  });

  return checks;
}

/**
 * 工作台自检：起真服务、验 token、读状态、访问无 token 时被拒。
 */
export async function runWorkbenchProbe(pageFile: string | null): Promise<SmokeCheck[]> {
  const checks: SmokeCheck[] = [];
  const root = mkdtempSync(join(tmpdir(), 'hutao-workbench-probe-'));
  const access = makeAccess(root, { ...makePolicy(root), workbenchPort: 0 });
  const qq = {
    getStatus: (): QqStatus => ({
      state: 'disabled',
      settings: DEFAULT_QQ_SETTINGS,
      botNickname: '',
      connectedAt: null,
      lastError: null,
      lastMessageAt: null,
      todayReplies: 0,
      groups: [],
      recentReplies: [],
      listenUrl: 'ws://127.0.0.1:6700/ws'
    }),
    updateSettings: async () => DEFAULT_QQ_SETTINGS,
    refreshGroups: async () => []
  } as unknown as QqService;
  const ai = {
    getStatus: (): AiStatus => ({
      settings: DEFAULT_AI_SETTINGS,
      hasApiKey: false,
      keySource: null,
      encryptionAvailable: false,
      lastObservedAt: null,
      lastObservedTitle: null,
      lastError: null
    })
  } as unknown as AiService;

  const server = new WorkbenchServer({
    access,
    qq,
    ai,
    logger: noopLogger,
    appVersion: 'smoke',
    findPageFile: () => (pageFile && existsSync(pageFile) ? pageFile : null)
  });

  try {
    const url = await server.start();
    checks.push({ name: 'workbench listen', ok: Boolean(url && server.running), detail: url ? url.replace(/t=[^&]+/, 't=***') : 'none' });

    const token = access.ensureToken().workbenchToken;
    const base = `http://127.0.0.1:${server.port}`;

    const unauth = await fetch(`${base}/api/status`);
    checks.push({ name: 'workbench rejects missing token', ok: unauth.status === 401, detail: String(unauth.status) });

    const authed = await fetch(`${base}/api/status`, { headers: { 'x-hutao-token': token } });
    const payload = (await authed.json()) as { ok?: boolean; access?: { policy?: { enabled?: boolean } } };
    checks.push({
      name: 'workbench status json',
      ok: authed.status === 200 && payload.ok === true && payload.access?.policy?.enabled === true,
      detail: String(authed.status)
    });

    if (pageFile) {
      const page = await fetch(`${base}/?t=${token}`);
      const html = await page.text();
      checks.push({
        name: 'workbench page served',
        ok: page.status === 200 && html.includes('胡桃工作台'),
        detail: `${html.length} 字节`
      });
    }

    const action = await fetch(`${base}/api/action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hutao-token': token },
      body: JSON.stringify({ action: 'list-dir', payload: { path: root } })
    });
    const actionPayload = (await action.json()) as { ok?: boolean };
    checks.push({ name: 'workbench action routed', ok: action.status === 200 && actionPayload.ok !== false, detail: String(action.status) });
  } catch (error) {
    checks.push({ name: 'workbench probe', ok: false, detail: error instanceof Error ? error.message : String(error) });
  } finally {
    await server.stop();
  }

  return checks;
}
