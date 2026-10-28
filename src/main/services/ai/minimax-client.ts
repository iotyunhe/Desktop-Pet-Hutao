import { AI_REPLY_TEXT_LIMIT } from '../../../shared/ai';

export const MINIMAX_TIMEOUT_MS = 30_000;

export interface MiniMaxClientOptions {
  baseUrl: () => string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface ChatRequest {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}

export interface TtsRequest {
  apiKey: string;
  text: string;
  model: string;
  voiceId: string;
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

export function getMiniMaxErrorMessage(payload: unknown): string | null {
  const root = getRecord(payload);
  if (!root) {
    return null;
  }

  const error = getNestedRecord(root, 'error');
  if (error) {
    const message = getNestedString(error, 'message') ?? getNestedString(error, 'msg');
    const code = error.code ?? error.status_code ?? error.statusCode;

    if (message && /invalid api key/i.test(message)) {
      return `API Key 无效或接口区域不匹配（${code ? `MiniMax ${String(code)}` : 'MiniMax'}）。`;
    }

    if (message && /usage limit exceeded/i.test(message)) {
      return `MiniMax 语音额度或套餐资源不足：${message}`;
    }

    return message;
  }

  const baseResponse = getNestedRecord(root, 'base_resp') ?? getNestedRecord(root, 'baseResponse');
  if (baseResponse) {
    const statusCode = baseResponse.status_code ?? baseResponse.statusCode;
    const statusMessage = getNestedString(baseResponse, 'status_msg') ?? getNestedString(baseResponse, 'statusMessage');

    if (statusMessage && /usage limit exceeded/i.test(statusMessage)) {
      return `MiniMax 语音额度或套餐资源不足：${statusMessage}`;
    }

    if (statusCode !== undefined && Number(statusCode) !== 0 && statusMessage) {
      return statusMessage;
    }
  }

  return getNestedString(root, 'msg') ?? getNestedString(root, 'message');
}

export function stripReasoningText(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/\s+/g, ' ').trim();
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
    return value
      .map((item) => {
        const itemRecord = getRecord(item);
        return itemRecord ? getNestedString(itemRecord, 'text') : null;
      })
      .filter((item): item is string => Boolean(item))
      .join('');
  }

  return null;
}

export function extractMiniMaxChatText(payload: unknown): string {
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

  throw new Error('MiniMax 没有返回可显示的回复。');
}

function isProbablyHexAudio(value: string): boolean {
  return value.length % 2 === 0 && /^[a-f0-9]+$/i.test(value);
}

export function extractMiniMaxAudioBase64(payload: unknown): string {
  const root = getRecord(payload);
  const data = root ? getNestedRecord(root, 'data') : null;
  const audio =
    (data ? getNestedString(data, 'audio') : null) ??
    (data ? getNestedString(data, 'audio_file') : null) ??
    (root ? getNestedString(root, 'audio') : null);

  if (!audio) {
    throw new Error('MiniMax 没有返回语音数据。');
  }

  return isProbablyHexAudio(audio) ? Buffer.from(audio, 'hex').toString('base64') : audio;
}

export class MiniMaxClient {
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: MiniMaxClientOptions) {
    this.timeoutMs = options.timeoutMs ?? MINIMAX_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async chat(request: ChatRequest): Promise<string> {
    const payload = await this.requestJson('chat/completions', request.apiKey, {
      model: request.model,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user }
      ],
      temperature: request.temperature ?? 0.82,
      max_tokens: request.maxTokens ?? 160,
      stream: false
    });

    return extractMiniMaxChatText(payload);
  }

  async tts(request: TtsRequest): Promise<string> {
    const payload = await this.requestJson('t2a_v2', request.apiKey, {
      model: request.model,
      text: request.text,
      stream: false,
      language_boost: 'auto',
      output_format: 'hex',
      voice_setting: {
        voice_id: request.voiceId,
        speed: 1,
        vol: 1,
        pitch: 0
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: 'mp3',
        channel: 1
      }
    });

    return extractMiniMaxAudioBase64(payload);
  }

  private async requestJson(path: string, apiKey: string, body: Record<string, unknown>): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const endpoint = `${this.options.baseUrl().replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;

    try {
      const response = await this.fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const rawText = await response.text();
      const payload = rawText ? (JSON.parse(rawText) as unknown) : null;
      const apiError = getMiniMaxErrorMessage(payload);

      if (!response.ok || apiError) {
        throw new Error(apiError ?? `MiniMax 请求失败：HTTP ${response.status}`);
      }

      return payload;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('MiniMax 请求超时。');
      }

      if (error instanceof SyntaxError) {
        throw new Error('MiniMax 返回内容不是有效 JSON。');
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
