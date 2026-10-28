/**
 * 启动桌宠的冒烟测试并打印结果。
 *
 *   node scripts/run-smoke.cjs                 # 用仓库里的 Electron 跑开发构建
 *   node scripts/run-smoke.cjs --exe "release/win-unpacked/胡桃桌宠.exe"
 *   node scripts/run-smoke.cjs --bilibili      # 额外抓一条 B 站视频验证网络
 */
const { spawnSync } = require('node:child_process');
const { existsSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const root = resolve(__dirname, '..');
const argv = process.argv.slice(2);
const exeFlag = argv.indexOf('--exe');
const packagedExe = exeFlag >= 0 ? resolve(argv[exeFlag + 1] ?? '') : null;
const captureFlag = argv.indexOf('--capture');
const capturePath = captureFlag >= 0 ? resolve(argv[captureFlag + 1] ?? '') : null;
const bilibiliSmoke = argv.includes('--bilibili');
const resultPath = join(tmpdir(), `hutao-smoke-${process.pid}-${Date.now()}.json`);

if (packagedExe && !existsSync(packagedExe)) {
  console.error(`找不到可执行文件：${packagedExe}`);
  process.exit(1);
}

const exePath = packagedExe ?? join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const modeFlag = bilibiliSmoke ? '--bilibili-smoke' : '--smoke-test';
const args = packagedExe ? [modeFlag] : [root, modeFlag];

args.push(`--smoke-result=${resultPath}`);

if (capturePath) {
  args.push(`--capture=${capturePath}`);
}

const captureMoodArg = argv.find((arg) => arg.startsWith('--capture-mood='));
if (captureMoodArg) {
  args.push(captureMoodArg);
}

const captureTabArg = argv.find((arg) => arg.startsWith('--capture-tab='));
if (captureTabArg) {
  args.push(captureTabArg);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const result = spawnSync(exePath, args, {
  cwd: root,
  env,
  stdio: 'inherit',
  windowsHide: true,
  timeout: 120_000
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

let ok = result.status === 0;

if (existsSync(resultPath)) {
  const payloadText = readFileSync(resultPath, 'utf8');
  console.log(payloadText);
  rmSync(resultPath, { force: true });

  try {
    ok = JSON.parse(payloadText).ok === true;
  } catch {
    ok = false;
  }
} else {
  console.error('冒烟测试没有产出结果文件。');
  ok = false;
}

if (result.status !== 0) {
  console.error(`子进程退出码：${result.status ?? 'unknown'}（以结果文件为准）`);
}

process.exit(ok ? 0 : 1);
