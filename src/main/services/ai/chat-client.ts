import { AI_MAX_TOKENS, AI_MODEL_LIST_LIMIT, AI_REPLY_TEXT_LIMIT, AI_REQUEST_TIMEOUT_MS, AI_TEMPERATURE } from '../../../shared/ai';
import type { AiModelList } from '../../../shared/ai';

export const CHAT_TIMEOUT_MS = AI_REQUEST_TIMEOUT_MS;

export interface ChatClientOptions {
  baseUrl: () => string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  randomId?: () => string;
}

export interface ChatRequest {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function getNestedRecord(value: Record<string, unknown>, key: string): Record<string, unknown> | null {
  return getRecord(value[key]);
}

function getNestedString(value: Record<string, unknown>, key: string): string | null {
  const nextValue = value[key];
  return typeof nextValue === 'string' && nextValue.trim() ? nextValue.trim() : null;
}

/** 去掉部分模型混进正文的 <think> 段，并把换行压成空格。 */
export function stripReasoningText(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function limitReplyText(text: string, limit = AI_REPLY_TEXT_LIMIT): string {
  const cleanText = stripReasoningText(text);
  return cleanText.length > limit ? `${cleanText.slice(0, limit - 1)}…` : cleanText;
}

function extractTextContent(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => {
        const itemRecord = getRecord(item);
        return itemRecord ? getNestedString(itemRecord, 'text') : null;
      })
      .filter((item): item is string => Boolean(item));

    return parts.length > 0 ? parts.join('') : null;
  }

  return null;
}

/**
 * 从 OpenAI 兼容响应里取正文。
 * 只读 message.content / delta.content，刻意忽略 reasoning_content，
 * 免得把思维链当成胡桃的台词念出来。
 */
export function extractChatText(payload: unknown): string {
  const root = getRecord(payload);
  const choices = Array.isArray(root?.choices) ? root.choices : [];

  for (const choice of choices) {
    const choiceRecord = getRecord(choice);
    if (!choiceRecord) {
      continue;
    }

    const message = getNestedRecord(choiceRecord, 'message');
    const delta = getNestedRecord(choiceRecord, 'delta');
    const text =
      extractTextContent(message?.content) ??
      extractTextContent(delta?.content) ??
      getNestedString(choiceRecord, 'text') ??
      getNestedString(choiceRecord, 'content');

    if (text) {
      return limitReplyText(text);
    }
  }

  const directText = getNestedString(root ?? {}, 'reply') ?? getNestedString(root ?? {}, 'text');
  if (directText) {
    return limitReplyText(directText);
  }

  throw new Error('接口没有返回可显示的回复。');
}

/** 把各家五花八门的错误体压成一句能看懂的话。 */
export function extractApiErrorMessage(payload: unknown): string | null {
  const root = getRecord(payload);
  if (!root) {
    return null;
  }

  const error = getNestedRecord(root, 'error');
  if (error) {
    const nested = getRecord(error.error) ?? error;
    const message = getNestedString(nested, 'message') ?? getNestedString(nested, 'msg') ?? getNestedString(error, 'message');
    const type = getNestedString(nested, 'type') ?? getNestedString(error, 'type');
    if (message) {
      return type ? `${message}（${type}）` : message;
    }
    if (type) {
      return type;
    }
  }

  return getNestedString(root, 'message') ?? getNestedString(root, 'msg');
}

export function getBaseUrlHost(baseUrl: string): string | null {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return null;
  }
}

/**
 * 通用 OpenAI 兼容客户端。默认指向 OpenCode Go；
 * 换成 DeepSeek 官方、Ollama、vLLM 等只需要改 base URL。
 */
export class ChatClient {
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly randomId: () => string;

  constructor(private readonly options: ChatClientOptions) {
    this.timeoutMs = options.timeoutMs ?? CHAT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.randomId = options.randomId ?? (() => Math.random().toString(36).slice(2, 12));
  }

  async chat(request: ChatRequest): Promise<string> {
    const payload = await this.requestJson('chat/completions', request.apiKey, {
      model: request.model,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user }
      ],
      temperature: request.temperature ?? AI_TEMPERATURE,
      max_tokens: request.maxTokens ?? AI_MAX_TOKENS,
      stream: false
    });

    return extractChatText(payload);
  }

  async listModels(apiKey: string): Promise<AiModelList> {
    try {
      const payload = await this.requestJson('models', apiKey, undefined, 'GET');
      const root = getRecord(payload);
      const list = Array.isArray(root?.data) ? root.data : Array.isArray(payload) ? (payload as unknown[]) : [];
      const models = list
        .map((item) => {
          const record = getRecord(item);
          return record ? getNestedString(record, 'id') : typeof item === 'string' ? item : null;
        })
        .filter((id): id is string => Boolean(id))
        .slice(0, AI_MODEL_LIST_LIMIT);

      if (models.length === 0) {
        return { ok: false, models: [], error: '接口没有返回模型列表，直接手填模型名也可以。' };
      }

      return { ok: true, models };
    } catch (error) {
      return { ok: false, models: [], error: error instanceof Error ? error.message : '拉取模型列表失败。' };
    }
  }

  private buildUrl(path: string): string {
    return `${this.options.baseUrl().replace(/\/+$/, '')}/${path}`;
  }

  private buildHeaders(apiKey: string): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };

    // OpenCode 的网关要求 x-opencode-session，否则 400 MissingSessionID。
    const host = getBaseUrlHost(this.options.baseUrl());
    if (host && host.endsWith('opencode.ai')) {
      headers['x-opencode-session'] = `hutao-${this.randomId()}`;
      headers['x-opencode-client'] = 'hutao-desktop-pet';
    }

    return headers;
  }

  private async requestJson(
    path: string,
    apiKey: string,
    body: unknown | undefined,
    method: 'GET' | 'POST' = 'POST'
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(this.buildUrl(path), {
        method,
        headers: this.buildHeaders(apiKey),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });

      const text = await response.text();
      let payload: unknown = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        throw new Error(describeHttpFailure(response.status, payload, text));
      }

      if (payload === null) {
        throw new Error('接口返回了空内容，检查一下接口地址与模型名。');
      }

      return payload;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`接口 ${Math.round(this.timeoutMs / 1000)} 秒没有响应，稍后再试。`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

function describeHttpFailure(status: number, payload: unknown, rawText: string): string {
  const message = extractApiErrorMessage(payload);

  if (status === 401 || status === 403) {
    return message ? `API Key 无效或没有权限：${message}` : `API Key 无效或没有权限（HTTP ${status}）。`;
  }

  if (status === 404) {
    return message ? `接口或模型不存在：${message}` : '接口地址或模型名不对，确认是 OpenAI 兼容的 /v1 地址。';
  }

  if (status === 429) {
    return '接口限流了，等一会儿再试。';
  }

  if (message) {
    return `接口返回 ${status}：${message}`;
  }

  const trimmed = rawText.trim().slice(0, 120);
  return trimmed ? `接口返回 ${status}：${trimmed}` : `接口返回 ${status}。`;
}
