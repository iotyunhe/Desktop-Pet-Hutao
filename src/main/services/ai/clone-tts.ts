import { TTS_CLONE_TIMEOUT_MS, type TtsLang } from '../../../shared/ai';

/** 一次克隆音色合成请求。 */
export interface CloneTtsRequest {
  text: string;
  /** 参考音频的绝对路径，必须存在于跑 GPT-SoVITS 的那台机器上。 */
  refAudioPath: string;
  /** 参考音频里说的原话。 */
  promptText: string;
  promptLang: TtsLang;
  textLang: TtsLang;
}

export interface CloneTtsAudio {
  audioBase64: string;
  mimeType: 'audio/wav';
}

export interface CloneTtsOptions {
  /** 每次调用都重新读一次，方便用户在面板里改完地址立即生效。 */
  baseUrl: () => string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface CloneTtsProbe {
  ok: boolean;
  error?: string;
}

/**
 * GPT-SoVITS 的 api_v2 客户端：POST {base}/tts 返回 wav 音频流，
 * 失败时返回 JSON（http 400）。
 */
export class CloneTtsClient {
  private readonly baseUrl: () => string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: CloneTtsOptions) {
    this.baseUrl = options.baseUrl;
    this.timeoutMs = options.timeoutMs ?? TTS_CLONE_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get endpoint(): string {
    return `${this.baseUrl().replace(/\/+$/, '')}/tts`;
  }

  async speak(request: CloneTtsRequest): Promise<CloneTtsAudio> {
    const text = request.text.trim();
    if (!text) {
      throw new Error('要念的内容是空的');
    }
    if (!request.refAudioPath.trim()) {
      throw new Error('还没填参考音频的路径');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          text_lang: request.textLang,
          ref_audio_path: request.refAudioPath.trim(),
          prompt_text: request.promptText.trim(),
          prompt_lang: request.promptLang,
          text_split_method: 'cut5',
          batch_size: 1,
          media_type: 'wav',
          streaming_mode: false,
          parallel_infer: true,
          repetition_penalty: 1.35
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(await describeFailure(response));
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('application/json')) {
        throw new Error(await describeFailure(response));
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 512) {
        throw new Error('克隆音色服务返回的音频是空的');
      }
      return { audioBase64: bytes.toString('base64'), mimeType: 'audio/wav' };
    } catch (error) {
      throw new Error(this.decorate(error));
    } finally {
      clearTimeout(timer);
    }
  }

  /** 只是探一下服务在不在（GPT-SoVITS 自带 /docs）。 */
  async probe(): Promise<CloneTtsProbe> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await this.fetchImpl(`${this.baseUrl().replace(/\/+$/, '')}/docs`, {
        method: 'GET',
        signal: controller.signal
      });
      return response.ok ? { ok: true } : { ok: false, error: `接口返回 ${response.status}` };
    } catch {
      return { ok: false, error: '连不上克隆音色服务，看看 GPT-SoVITS 有没有在跑。' };
    } finally {
      clearTimeout(timer);
    }
  }

  private decorate(error: unknown): string {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return `克隆音色服务 ${Math.round(this.timeoutMs / 1000)} 秒没有响应`;
      }
      return error.message;
    }
    return String(error);
  }
}

async function describeFailure(response: Response): Promise<string> {
  let detail = '';
  try {
    const payload = (await response.json()) as { message?: unknown; detail?: unknown; error?: unknown };
    const message = payload?.message ?? payload?.detail ?? payload?.error;
    detail = typeof message === 'string' ? message : '';
  } catch {
    detail = '';
  }
  if (response.status === 404) {
    return detail || '克隆音色接口不存在，确认地址后面的 /tts 能通';
  }
  if (response.status === 400) {
    return detail || '克隆音色服务拒绝了这次请求：参考音频或台词可能不对';
  }
  return detail || `克隆音色接口返回 ${response.status}`;
}
