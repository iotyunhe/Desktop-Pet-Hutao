import type { ChatMessage, ChatToolCall, ChatWithToolsResult } from './chat-client';
import type { ToolExecOutcome } from '../access/ai-tools';

export interface ToolLoopOptions {
  /** 发一轮请求（测试里替换成假实现）。 */
  runChat: (messages: ChatMessage[]) => Promise<ChatWithToolsResult>;
  /** 执行一次工具调用。 */
  execute: (call: ChatToolCall) => Promise<ToolExecOutcome>;
  /** 最多几轮工具往返，默认 3，防止模型自己绕圈。 */
  maxSteps?: number;
  onToolCall?: (call: ChatToolCall) => void;
  onToolError?: (call: ChatToolCall, error: unknown) => void;
}

export const TOOL_LOOP_MAX_STEPS = 3;
const TOOL_LOOP_FALLBACK_TEXT = '嗯…我想了半天没想好怎么回，主人再问一次？';

function parseArguments(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function toAssistantMessage(result: ChatWithToolsResult): ChatMessage {
  return {
    role: 'assistant',
    content: result.content || '',
    ...(result.toolCalls.length > 0
      ? {
          tool_calls: result.toolCalls.map((call) => ({
            id: call.id,
            type: 'function' as const,
            function: { name: call.name, arguments: call.arguments }
          }))
        }
      : {})
  };
}

/**
 * 工具往返循环：模型要工具 → 执行 → 把结果塞回对话 → 再问一轮。
 * 纯逻辑，不碰网络和文件，方便单测。
 */
export async function runToolLoop(
  messages: ChatMessage[],
  options: ToolLoopOptions
): Promise<{ text: string; steps: number; toolCalls: number }> {
  const maxSteps = Math.max(1, options.maxSteps ?? TOOL_LOOP_MAX_STEPS);
  const conversation: ChatMessage[] = [...messages];
  let lastText = '';
  let toolCallCount = 0;

  for (let step = 0; step < maxSteps; step += 1) {
    const result = await options.runChat(conversation);
    lastText = result.content.trim();

    if (result.toolCalls.length === 0) {
      return { text: lastText, steps: step + 1, toolCalls: toolCallCount };
    }

    conversation.push(toAssistantMessage(result));

    for (const call of result.toolCalls) {
      toolCallCount += 1;
      options.onToolCall?.(call);

      let outcome: ToolExecOutcome;
      try {
        outcome = await options.execute(call);
      } catch (error) {
        options.onToolError?.(call, error);
        outcome = { text: `工具 ${call.name} 出错了：${error instanceof Error ? error.message : String(error)}` };
      }

      conversation.push({ role: 'tool', tool_call_id: call.id, content: outcome.text.slice(0, 6000) });

      if (outcome.image) {
        conversation.push({
          role: 'user',
          content: [
            { type: 'text', text: '（这是刚刚截到的画面）' },
            { type: 'image_url', image_url: { url: `data:${outcome.image.mimeType};base64,${outcome.image.base64}` } }
          ]
        });
      }
    }
  }

  return { text: lastText || TOOL_LOOP_FALLBACK_TEXT, steps: maxSteps, toolCalls: toolCallCount };
}

/** 解析工具调用参数（对模型给出的乱码尽量宽容）。 */
export function parseToolArguments(call: ChatToolCall): Record<string, unknown> {
  return parseArguments(call.arguments);
}
