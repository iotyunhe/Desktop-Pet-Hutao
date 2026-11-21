import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_AI_SETTINGS, DEFAULT_TTS_VOICE } from '../src/shared/ai';
import { DEFAULT_QQ_SETTINGS } from '../src/shared/qq';
import { normalizeAiSettings, normalizeApiBaseUrl, normalizeQqSettings } from '../src/shared/normalize';

test('normalizeApiBaseUrl 保留合法的兼容接口地址', () => {
  assert.equal(normalizeApiBaseUrl('https://opencode.ai/inference/go/v1'), 'https://opencode.ai/inference/go/v1');
  assert.equal(normalizeApiBaseUrl('https://api.deepseek.com'), 'https://api.deepseek.com/v1');
  assert.equal(normalizeApiBaseUrl('http://127.0.0.1:11434/v1/'), 'http://127.0.0.1:11434/v1');
  assert.equal(normalizeApiBaseUrl('ftp://x'), DEFAULT_AI_SETTINGS.apiBaseUrl);
});

test('normalizeApiBaseUrl 把老的 MiniMax 端点迁移成默认接口', () => {
  assert.equal(normalizeApiBaseUrl('https://api.minimaxi.com/v1'), DEFAULT_AI_SETTINGS.apiBaseUrl);
  assert.equal(normalizeApiBaseUrl('https://api.minimax.io/v1'), DEFAULT_AI_SETTINGS.apiBaseUrl);
});

test('normalizeAiSettings 把 MiniMax 时代的字段迁移成系统语音', () => {
  const migrated = normalizeAiSettings({
    enabled: true,
    apiBaseUrl: 'https://api.minimaxi.com/v1',
    textModel: 'MiniMax-M2.7',
    ttsModel: 'speech-2.8-turbo',
    voiceId: 'Chinese (Mandarin)_Cute_Spirit'
  });

  assert.equal(migrated.apiBaseUrl, DEFAULT_AI_SETTINGS.apiBaseUrl);
  assert.equal(migrated.ttsEngine, 'system');
  assert.equal(migrated.ttsVoice, DEFAULT_TTS_VOICE);
  assert.equal(migrated.enabled, true);
});

test('normalizeAiSettings 夹紧观察间隔并只接受已知语音引擎', () => {
  const settings = normalizeAiSettings({ observeIntervalMinutes: 999, ttsEngine: 'weird' });
  assert.equal(settings.observeIntervalMinutes, 30);
  assert.equal(settings.ttsEngine, 'system');
  assert.equal(normalizeAiSettings({ observeIntervalMinutes: 1 }).observeIntervalMinutes, 5);
  assert.equal(normalizeAiSettings({ ttsEngine: 'off' }).ttsEngine, 'off');
});

test('normalizeQqSettings 夹紧端口、概率与白名单', () => {
  const settings = normalizeQqSettings({
    enabled: true,
    wsPort: 100,
    nameReplyChance: 300,
    interjectChance: -5,
    interjectCooldownMinutes: 0,
    maxRepliesPer10Minutes: 99,
    selfQq: '123-456-789-012-345',
    allowedGroups: [1, '2', 2, 0, -3, 1e12],
    quietHoursStart: '25:00'
  });

  assert.equal(settings.wsPort, 1024);
  assert.equal(settings.nameReplyChance, 100);
  assert.equal(settings.interjectChance, 0);
  assert.equal(settings.interjectCooldownMinutes, 1);
  assert.equal(settings.maxRepliesPer10Minutes, 20);
  assert.equal(settings.selfQq, '123456789012');
  assert.deepEqual(settings.allowedGroups, [1, 2, 1000000000000]);
  assert.equal(settings.quietHoursStart, DEFAULT_QQ_SETTINGS.quietHoursStart);
});

test('normalizeQqSettings 对空值给出关闭状态的默认配置', () => {
  assert.deepEqual(normalizeQqSettings(null), DEFAULT_QQ_SETTINGS);
});
