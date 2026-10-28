const { spawnSync } = require('node:child_process');

const npmCli = process.env.npm_execpath;
const builderCli = require.resolve('electron-builder/cli');
const mirror = process.env.ELECTRON_BUILDER_BINARIES_MIRROR || 'https://npmmirror.com/mirrors/electron-builder-binaries/';

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    env
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!npmCli) {
  throw new Error('Cannot locate npm CLI from npm_execpath.');
}

// 某些终端会把 ELECTRON_RUN_AS_NODE 留在环境里，electron-builder 会误以为在 Node 里跑。
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

run(process.execPath, [npmCli, 'run', 'build'], env);
run(process.execPath, [builderCli, '--win', 'nsis', 'portable', '--x64'], {
  ...env,
  ELECTRON_BUILDER_BINARIES_MIRROR: mirror
});
