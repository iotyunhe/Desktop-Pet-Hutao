import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatMessage, ChatWithToolsResult } from '../src/main/services/ai/chat-client';
import { runToolLoop } from '../src/main/services/ai/tool-loop';
import { buildAccessToolDefinitions } from '../src/main/services/access/ai-tools';
import { DEFAULT_ACCESS_POLICY } from '../src/shared/access';

function reply(content: string, toolCalls: ChatWithToolsResult['toolCalls'] = []): ChatWithToolsResult {
  return { content, toolCalls, finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop' };
}

test('没有工具调用时直接返回模型的话', async () => {
  const messages: ChatMessage[] = [{ role: 'user', content: '在吗' }];
  const result = await runToolLoop(messages, {
    runChat: async () => reply('在的在的'),
    execute: async () => ({ text: 'unused' })
  });

  assert.equal(result.text, '在的在的');
  assert.equal(result.steps, 1);
  assert.equal(result.toolCalls, 0);
});

test('工具调用会把结果带回对话再问一轮', async () => {
  const seen: ChatMessage[][] = [];
  let round = 0;

  const result = await runToolLoop([{ role: 'user', content: '读一下便签' }], {
    runChat: async (messages) => {
      seen.push(messages);
      round += 1;
      if (round === 1) {
        return reply('', [
          { id: 'call-1', name: 'read_text_file', arguments: '{"path":"E:\\\\note.txt"}' }
        ]);
      }
      return reply('便签上写着明天买糖');
    },
    execute: async () => ({ text: '明天买糖' })
  });

  assert.equal(result.text, '便签上写着明天买糖');
  assert.equal(result.toolCalls, 1);
  assert.equal(result.steps, 2);

  const secondRoundLines = seen[1];
  const toolMessage = secondRoundLines.find((message) => message.role === 'tool');
  assert.ok(toolMessage);
  assert.equal((toolMessage as { content: string }).content, '明天买糖');
});

test('工具执行抛错时把错误交回模型，不会中断对话', async () => {
  let round = 0;
  const errors: unknown[] = [];

  const result = await runToolLoop([{ role: 'user', content: '看看目录' }], {
    runChat: async () => {
      round += 1;
      if (round === 1) {
        return reply('', [{ id: 'call-1', name: 'list_directory', arguments: '{}' }]);
      }
      return reply('目录读不了，主人检查下白名单？');
    },
    execute: async () => {
      throw new Error('目录被占用');
    },
    onToolError: (_call, error) => errors.push(error)
  });

  assert.equal(result.text, '目录读不了，主人检查下白名单？');
  assert.equal(errors.length, 1);
});

test('模型一直要工具时会停在步数上限', async () => {
  let calls = 0;
  const result = await runToolLoop([{ role: 'user', content: '循环' }], {
    maxSteps: 2,
    runChat: async () => {
      calls += 1;
      return reply('', [{ id: `call-${calls}`, name: 'take_screenshot', arguments: '{}' }]);
    },
    execute: async () => ({ text: '截图好了' })
  });

  assert.equal(calls, 2);
  assert.equal(result.toolCalls, 2);
});

test('工具定义只在策略开启对应能力时出现', () => {
  const closed = buildAccessToolDefinitions(DEFAULT_ACCESS_POLICY);
  assert.equal(closed.length, 0);

  const opened = buildAccessToolDefinitions({
    ...DEFAULT_ACCESS_POLICY,
    enabled: true,
    allowRead: true,
    readRoots: ['E:\\Project\\HuTao'],
    allowScreenshot: true,
    allowLaunch: true,
    launchAllowlist: [{ id: 'site', label: 'B 站', target: 'https://www.bilibili.com', kind: 'url' }],
    allowShell: true
  });
  const names = opened.map((tool) => tool.function.name);

  assert.deepEqual(names.sort(), ['list_directory', 'open_item', 'read_text_file', 'run_command', 'take_screenshot']);
});
