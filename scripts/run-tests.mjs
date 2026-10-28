import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const testsDir = join(root, 'tests');
const outDir = join(root, '.tmp', 'tests');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const files = readdirSync(testsDir)
  .filter((file) => file.endsWith('.test.ts'))
  .sort();

if (files.length === 0) {
  console.error('没有找到测试文件。');
  process.exit(1);
}

const outputs = [];

for (const file of files) {
  const outfile = join(outDir, file.replace(/\.ts$/, '.mjs'));
  await build({
    entryPoints: [join(testsDir, file)],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    sourcemap: 'inline',
    logLevel: 'warning',
    external: ['electron']
  });
  outputs.push(outfile);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const result = spawnSync(process.execPath, ['--test', ...outputs], {
  cwd: root,
  stdio: 'inherit',
  env
});

process.exit(result.status ?? 1);
