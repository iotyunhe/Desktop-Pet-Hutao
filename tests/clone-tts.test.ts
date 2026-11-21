import assert from 'node:assert/strict';
import test from 'node:test';

import { CloneTtsClient } from '../src/main/services/ai/clone-tts';

function makeResponse(init: {
  ok?: boolean;
  status?: number;
  contentType?: string;
  body?: Uint8Array | string;
}): Response {
  const { ok = true, status = 200, contentType = 'audio/wav', body = new Uint8Array(2048).fill(1) } = init;
  return {
    ok,
    status,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null)
    },
    arrayBuffer: async () => {
      const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
    json: async () => (typeof body === 'string' ? JSON.parse(body) : {})
  } as unknown as Response;
}

test('CloneTtsClient 按 api_v2 的要求发 POST，并把 wav 转成 base64', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const client = new CloneTtsClient({
    baseUrl: () => 'http://127.0.0.1:9880',
    fetchImpl: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return makeResponse({});
    }) as unknown as typeof fetch
  });

  const audio = await client.speak({
    text: '嘿嘿，本堂主试音营业中。',
    refAudioPath: 'D:\\GPT-SoVITS\\ref\\hutao-ref.wav',
    promptText: '这句话是参考音频。',
    promptLang: 'zh',
    textLang: 'zh'
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, 'http://127.0.0.1:9880/tts');
  const body = JSON.parse(String(calls[0]?.init.body));
  assert.equal(body.text, '嘿嘿，本堂主试音营业中。');
  assert.equal(body.text_lang, 'zh');
  assert.equal(body.prompt_lang, 'zh');
  assert.equal(body.ref_audio_path, 'D:\\GPT-SoVITS\\ref\\hutao-ref.wav');
  assert.equal(body.media_type, 'wav');
  assert.equal(audio.mimeType, 'audio/wav');
  assert.ok(audio.audioBase64.length > 100);
});

test('CloneTtsClient 把 400 的 JSON 错误变成人话', async () => {
  const client = new CloneTtsClient({
    baseUrl: () => 'http://127.0.0.1:9880/',
    fetchImpl: (async () =>
      makeResponse({
        ok: false,
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ message: '参考音频不存在' })
      })) as unknown as typeof fetch
  });

  await assert.rejects(
    () =>
      client.speak({
        text: '你好',
        refAudioPath: 'D:\\nope.wav',
        promptText: '',
        promptLang: 'zh',
        textLang: 'zh'
      }),
    /参考音频不存在/
  );
});

test('CloneTtsClient 没有参考音频时直接拒绝，不发请求', async () => {
  let called = false;
  const client = new CloneTtsClient({
    baseUrl: () => 'http://127.0.0.1:9880',
    fetchImpl: (async () => {
      called = true;
      return makeResponse({});
    }) as unknown as typeof fetch
  });

  await assert.rejects(
    () => client.speak({ text: '你好', refAudioPath: '  ', promptText: '', promptLang: 'zh', textLang: 'zh' }),
    /参考音频/
  );
  assert.equal(called, false);
});

test('CloneTtsClient 返回空音频时报错', async () => {
  const client = new CloneTtsClient({
    baseUrl: () => 'http://127.0.0.1:9880',
    fetchImpl: (async () => makeResponse({ body: new Uint8Array(8) })) as unknown as typeof fetch
  });

  await assert.rejects(
    () =>
      client.speak({
        text: '你好',
        refAudioPath: 'D:\\ref.wav',
        promptText: '',
        promptLang: 'zh',
        textLang: 'zh'
      }),
    /空的/
  );
});

test('CloneTtsClient.probe 连不上时给出提示', async () => {
  const client = new CloneTtsClient({
    baseUrl: () => 'http://127.0.0.1:9880',
    fetchImpl: (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch
  });

  const result = await client.probe();
  assert.equal(result.ok, false);
  assert.match(String(result.error), /GPT-SoVITS/);
});
