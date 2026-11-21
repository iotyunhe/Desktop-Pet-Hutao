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
  // 旧的 MiniMax 模型名在新网关上不存在，迁移时换成默认模型。
  assert.equal(migrated.textModel, DEFAULT_AI_SETTINGS.textModel);
});

test('normalizeAiSettings 不覆盖用户自己填的第三方模型名', () => {
  const settings = normalizeAiSettings({
    apiBaseUrl: 'https://api.deepseek.com/v1',
    textModel: 'deepseek-chat'
  });

  assert.equal(settings.apiBaseUrl, 'https://api.deepseek.com/v1');
  assert.equal(settings.textModel, 'deepseek-chat');
});

test('normalizeAiSettings 对已经迁移过接口地址的存档仍然替换旧模型名', () => {
  // 上一次启动已经把接口地址换成默认网关，但模型名还留着 MiniMax 的，
  // 这种情况也要自愈，否则每次请求都会 400。
  const settings = normalizeAiSettings({
    apiBaseUrl: DEFAULT_AI_SETTINGS.apiBaseUrl,
    textModel: 'MiniMax-M2.7'
  });

  assert.equal(settings.textModel, DEFAULT_AI_SETTINGS.textModel);
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
