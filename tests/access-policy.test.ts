import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_ACCESS_POLICY,
  MAX_LAUNCH_ENTRIES,
  MAX_READ_ROOTS
} from '../src/shared/access';
import { MAX_QQ_ADMINS } from '../src/shared/qq';
import {
  isBlockedAccessPath,
  normalizeAccessPolicy,
  normalizeAccessRoots,
  normalizeLaunchEntries,
  normalizeQqAdmins
} from '../src/shared/normalize';

test('normalizeAccessPolicy 默认全部关闭', () => {
  const policy = normalizeAccessPolicy(null);
  assert.equal(policy.enabled, false);
  assert.equal(policy.allowRead, false);
  assert.equal(policy.allowScreenshot, false);
  assert.equal(policy.allowLaunch, false);
  assert.equal(policy.allowShell, false);
  assert.deepEqual(policy.readRoots, []);
  assert.deepEqual(policy.launchAllowlist, []);
  assert.equal(policy.maxOpsPerHour, DEFAULT_ACCESS_POLICY.maxOpsPerHour);
});

test('normalizeAccessPolicy 夹紧数值并丢掉危险目录', () => {
  const policy = normalizeAccessPolicy({
    enabled: true,
    shellTimeoutMs: 999999,
    maxOpsPerHour: -5,
    workbenchPort: 80,
    workbenchToken: 'bad token!!',
    readRoots: ['E:\\Project\\HuTao', 'C:\\Windows', 'c:\\windows\\system32', 'E:\\Project\\HuTao', 'relative\\path']
  });

  assert.equal(policy.shellTimeoutMs, 60000);
  assert.equal(policy.maxOpsPerHour, 1);
  assert.equal(policy.workbenchPort, 1024);
  assert.equal(policy.workbenchToken, 'badtoken');
  assert.deepEqual(policy.readRoots, ['E:\\Project\\HuTao']);
});

test('normalizeAccessRoots 去重并限制数量', () => {
  const roots = normalizeAccessRoots(
    Array.from({ length: MAX_READ_ROOTS + 5 }, (_, index) => `E:\\dir-${index}`)
  );
  assert.equal(roots.length, MAX_READ_ROOTS);
  assert.deepEqual(normalizeAccessRoots(['E:\\a', 'E:\\a']), ['E:\\a']);
});

test('isBlockedAccessPath 拦住系统目录与 AppData', () => {
  assert.equal(isBlockedAccessPath('C:\\Windows'), true);
  assert.equal(isBlockedAccessPath('C:\\Windows\\System32\\drivers'), true);
  assert.equal(isBlockedAccessPath('C:\\Program Files\\some app'), true);
  assert.equal(isBlockedAccessPath('C:\\Users\\98201\\AppData\\Roaming'), true);
  assert.equal(isBlockedAccessPath('C:\\'), true);
  assert.equal(isBlockedAccessPath('E:\\Project\\HuTao\\docs'), false);
});

test('normalizeLaunchEntries 只收 http(s) 与绝对路径，并限制数量', () => {
  const entries = normalizeLaunchEntries([
    { label: 'B 站', target: 'https://www.bilibili.com' },
    { label: '笔记', target: 'E:\\Project\\HuTao\\README.md' },
    { label: '脚本', target: 'calc.exe' },
    { label: 'ftp', target: 'ftp://example.com' },
    ...Array.from({ length: MAX_LAUNCH_ENTRIES + 3 }, (_, index) => ({
      label: `多余${index}`,
      target: `E:\\extra-${index}.txt`
    }))
  ]);

  assert.equal(entries.length, MAX_LAUNCH_ENTRIES);
  assert.equal(entries[0].kind, 'url');
  assert.equal(entries[1].kind, 'file');
  assert.ok(entries.every((entry) => entry.id.startsWith('item-')));
});

test('normalizeQqAdmins 只留数字 QQ 号', () => {
  const admins = normalizeQqAdmins(['982019603', ' 982019603 ', 'abc', '12', ...Array.from({ length: MAX_QQ_ADMINS + 3 }, (_, index) => `100000${index}`)]);
  assert.equal(admins[0], '982019603');
  assert.equal(admins.includes('abc'), false);
  assert.equal(admins.includes('12'), false);
  assert.ok(admins.length <= MAX_QQ_ADMINS);
});
