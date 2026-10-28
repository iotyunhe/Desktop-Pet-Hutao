const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

const electronViteBin = join(__dirname, '..', 'node_modules', 'electron-vite', 'bin', 'electron-vite.js');
const args = process.argv.slice(2);
const env = { ...process.env };

delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_FORCE_IS_PACKAGED;

const result = spawnSync(process.execPath, [electronViteBin, ...args], {
  cwd: join(__dirname, '..'),
  env,
  stdio: 'inherit',
  windowsHide: false
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
