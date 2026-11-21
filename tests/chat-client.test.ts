import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ChatClient,
  extractChatText,
  limitReplyText,
  stripReasoningText
} from '../src/main/services/ai/chat-client';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

const OPENCODE_BASE = 'https://opencode.ai/inference/go/v1';

test('ChatClient 对 OpenCode 网关补齐 session 头', async () => {
  const calls: Array<{ url: string; headers: Record<string, string>; body: string | undefined }> = [];

  const client = new ChatClient({
    baseUrl: () => OPENCODE_BASE,
    randomId: () => 'test',
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(url),
        headers: (init?.headers ?? {}) as Record<string, string>,
        body: typeof init?.body === 'string' ? init.body : undefined
      });
      return jsonResponse({ choices: [{ message: { content: '本堂主来啦' } }] });
    }) as typeof fetch
  });

  const reply = await client.chat({ apiKey: 'k', model: 'deepseek-v4.1-flash', system: 's', user: 'u' });

  assert.equal(reply, '本堂主来啦');
  assert.equal(calls[0]?.url, `${OPENCODE_BASE}/chat/completions`);
  assert.equal(calls[0]?.headers['x-opencode-session'], 'hutao-test');
  assert.equal(calls[0]?.headers['x-opencode-client'], 'hutao-desktop-pet');
  assert.match(String(calls[0]?.body), /"stream":false/);
});

test('ChatClient 对别的 OpenAI 兼容接口不加 OpenCode 专有头', async () => {
  let capturedHeaders: Record<string, string> = {};

  const client = new ChatClient({
    baseUrl: () => 'https://api.deepseek.com/v1',
    fetchImpl: (async (_url: string, init?: RequestInit) => {
      capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
      return jsonResponse({ choices: [{ message: { content: '好' } }] });
    }) as typeof fetch
  });

  await client.chat({ apiKey: 'k', model: 'deepseek-chat', system: 's', user: 'u' });

  assert.equal(capturedHeaders['x-opencode-session'], undefined);
  assert.equal(capturedHeaders.Authorization, 'Bearer k');
});

test('ChatClient 把 401 翻译成 Key 无效的提示', async () => {
  const client = new ChatClient({
    baseUrl: () => 'https://api.deepseek.com/v1',
    fetchImpl: (async () =>
      jsonResponse({ error: { message: 'invalid api key' } }, 401)) as typeof fetch
  });

  await assert.rejects(
    () => client.chat({ apiKey: 'bad', model: 'm', system: 's', user: 'u' }),
    /API Key 无效或没有权限/
  );
});

test('listModels 读取 data[].id 并去噪', async () => {
  const client = new ChatClient({
    baseUrl: () => 'https://example.com/v1',
    fetchImpl: (async () =>
      jsonResponse({ data: [{ id: 'deepseek-v4.1-flash' }, { id: '' }, { object: 'model' }] })) as typeof fetch
  });

  assert.deepEqual(await client.listModels('k'), { ok: true, models: ['deepseek-v4.1-flash'] });
});

test('extractChatText 只读正文，忽略 reasoning_content', () => {
  const payload = {
    choices: [
      {
        message: {
          reasoning_content: '用户只是打招呼，我应该笑着回应。',
          content: '嘿嘿，本堂主在呢。'
        }
      }
    ]
  };

  assert.equal(extractChatText(payload), '嘿嘿，本堂主在呢。');
});

test('stripReasoningText 去掉 think 段并把换行压平', () => {
  assert.equal(stripReasoningText('<think>先想想</think>\n\n 你好    呀 '), '你好 呀');
  assert.equal(limitReplyText('啊'.repeat(200), 10).length, 10);
});
