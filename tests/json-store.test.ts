import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { JsonStore } from '../src/main/storage/json-store';
import { DEFAULT_SETTINGS, type PetSettings } from '../src/shared/pet';
import { normalizeSettings } from '../src/shared/normalize';

function createStore(): { store: JsonStore<PetSettings>; dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), 'hutao-store-'));
  const file = join(dir, 'settings.json');
  const store = new JsonStore<PetSettings>({
    filePath: () => file,
    defaults: () => ({ ...DEFAULT_SETTINGS }),
    normalize: normalizeSettings
  });

  return { store, dir, file };
}

test('JsonStore 首次加载会落盘默认值并支持更新', (t) => {
  const { store, dir, file } = createStore();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  assert.deepEqual(store.load(), DEFAULT_SETTINGS);
  assert.equal(existsSync(file), true);

  store.update({ scale: 0.9, roamEnabled: false });
  const persisted = JSON.parse(readFileSync(file, 'utf8')) as PetSettings;

  assert.equal(persisted.scale, 0.9);
  assert.equal(persisted.roamEnabled, false);
  assert.equal(store.get().scale, 0.9);
});

test('JsonStore 读取时归一化脏数据并回写', (t) => {
  const { store, dir, file } = createStore();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  writeFileSync(file, JSON.stringify({ scale: 99, lastPosition: { x: 'bad' } }), 'utf8');

  const loaded = store.load();
  assert.equal(loaded.scale, 1);

  const persisted = JSON.parse(readFileSync(file, 'utf8')) as PetSettings;
  assert.equal(persisted.scale, 1);
});

test('JsonStore 遇到损坏 JSON 会回退默认值', (t) => {
  const { store, dir, file } = createStore();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  writeFileSync(file, '{ not json', 'utf8');

  assert.deepEqual(store.load(), DEFAULT_SETTINGS);
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).scale, DEFAULT_SETTINGS.scale);
});
