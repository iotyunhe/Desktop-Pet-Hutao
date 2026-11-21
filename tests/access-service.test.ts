import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_ACCESS_POLICY, type AccessPolicy } from '../src/shared/access';
import { LocalAccessService } from '../src/main/services/access/local-access-service';
import { noopLogger } from '../src/main/util/logger';

function createService(root: string, patch: Partial<AccessPolicy> = {}): LocalAccessService {
  let policy: AccessPolicy = {
    ...DEFAULT_ACCESS_POLICY,
    enabled: true,
    allowRead: true,
    readRoots: [root],
    maxOpsPerHour: 50,
    ...patch
  };

  return new LocalAccessService({
    getPolicy: () => policy,
    savePolicy: (next) => {
      policy = next;
      return policy;
    },
    userDataDir: root,
    logger: noopLogger,
    runShell: async () => ({ exitCode: 0, output: 'ok', truncated: false }),
    openPath: async () => '',
    openExternal: async () => undefined
  });
}

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'hutao-access-test-'));
  mkdirSync(join(root, 'sub'), { recursive: true });
  writeFileSync(join(root, 'note.txt'), '胡桃测试文件', 'utf8');
  writeFileSync(join(root, 'app.exe'), 'MZ', 'utf8');
  return root;
}

test('readTextFile 只能在白名单目录里读文本', () => {
  const root = createRoot();
  const service = createService(root);

  const ok = service.readTextFile(join(root, 'note.txt'));
  assert.equal(ok.ok, true);
  assert.equal(ok.ok && ok.data?.content, '胡桃测试文件');

  const outside = mkdtempSync(join(tmpdir(), 'hutao-access-other-'));
  writeFileSync(join(outside, 'secret.txt'), 'x', 'utf8');
  const denied = service.readTextFile(join(outside, 'secret.txt'));
  assert.equal(denied.ok, false);
  assert.equal(!denied.ok && denied.reason, 'path-outside');

  const binary = service.readTextFile(join(root, 'app.exe'));
  assert.equal(binary.ok, false);
  assert.equal(!binary.ok && binary.reason, 'not-allowed');
});

test('listDirectory 与 readTextFile 都受总开关约束', () => {
  const root = createRoot();
  const service = createService(root, { enabled: false });

  const read = service.readTextFile(join(root, 'note.txt'));
  const list = service.listDirectory(root);
  assert.equal(read.ok, false);
  assert.equal(list.ok, false);
});

test('超过每小时上限后拒绝继续操作', () => {
  const root = createRoot();
  const service = createService(root, { maxOpsPerHour: 1 });

  assert.equal(service.readTextFile(join(root, 'note.txt')).ok, true);
  const second = service.readTextFile(join(root, 'note.txt'));
  assert.equal(second.ok, false);
  assert.equal(!second.ok && second.reason, 'rate-limited');
});

test('命令必须审批通过才会执行', async () => {
  const root = createRoot();
  let executed = 0;
  const service = new LocalAccessService({
    getPolicy: () => ({ ...DEFAULT_ACCESS_POLICY, enabled: true, allowShell: true, shellTimeoutMs: 3000, maxOpsPerHour: 50 }),
    savePolicy: (next) => next,
    userDataDir: root,
    logger: noopLogger,
    runShell: async () => {
      executed += 1;
      return { exitCode: 0, output: 'done', truncated: false };
    }
  });

  const requested = service.requestCommand('echo hi');
  assert.equal(requested.ok, true);
  assert.equal(executed, 0);
  assert.equal(service.getStatus().pending.length, 1);

  const id = requested.ok ? requested.data?.id : undefined;
  assert.ok(id);
  const denied = service.deny(id as string);
  assert.equal(denied, true);
  assert.equal(executed, 0);
  assert.equal(service.getStatus().pending.length, 0);
});

test('打开白名单外的条目会被拒绝', async () => {
  const root = createRoot();
  const service = createService(root, {
    allowLaunch: true,
    launchAllowlist: [{ id: 'site', label: 'B 站', target: 'https://www.bilibili.com', kind: 'url' }]
  });

  const missing = await service.launch('nope');
  assert.equal(missing.ok, false);
  assert.equal(!missing.ok && missing.reason, 'not-allowed');
});
