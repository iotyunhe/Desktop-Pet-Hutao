export type AiReplySource = 'chat' | 'desktop-observation' | 'system' | 'qq-group';

/**
 * 语音引擎：system = 本机 Windows SAPI（默认音色，机械）；
 * clone = 本机 GPT-SoVITS 克隆音色（HTTP 接口）；off = 不发声。
 */
export type TtsEngine = 'system' | 'off' | 'clone';

/** GPT-SoVITS 支持的语言代号。 */
export type TtsLang = 'zh' | 'en' | 'ja' | 'ko' | 'yue';

export const TTS_LANG_OPTIONS: Array<{ value: TtsLang; label: string }> = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: '英文' },
  { value: 'ja', label: '日文' },
  { value: 'ko', label: '韩文' },
  { value: 'yue', label: '粤语' }
];

export interface AiSettings {
  enabled: boolean;
  autoObserveEnabled: boolean;
  observeIntervalMinutes: number;
  voiceEnabled: boolean;
  /** 任意 OpenAI 兼容接口的 base（会自动补 /v1，或以 /v1 结尾）。 */
  apiBaseUrl: string;
  textModel: string;
  ttsEngine: TtsEngine;
  ttsVoice: string;
  /** 克隆音色服务的地址，默认本机 GPT-SoVITS api_v2。 */
  ttsApiUrl: string;
  /** 参考音频的绝对路径（3~10 秒、单声道 wav 最稳）。 */
  ttsRefAudio: string;
  /** 参考音频里说的那句原话，必须和音频内容一致。 */
  ttsPromptText: string;
  ttsPromptLang: TtsLang;
  ttsTextLang: TtsLang;
  persona: string;
}

export type AiSettingsPatch = Partial<AiSettings>;

export interface DesktopObservation {
  appName: string;
  title: string;
  observedAt: string;
}

export interface AiStatus {
  settings: AiSettings;
  hasApiKey: boolean;
  /** stored = 面板里保存的加密 Key；environment = 从环境变量读取。 */
  keySource: 'stored' | 'environment' | null;
  encryptionAvailable: boolean;
  lastObservedAt: string | null;
  lastObservedTitle: string | null;
  lastError: string | null;
}

export interface AiMessageRequest {
  text: string;
}

export interface AiReply {
  ok: boolean;
  source: AiReplySource;
  text: string;
  observed?: DesktopObservation | null;
  audioBase64?: string;
  audioMimeType?: string;
  error?: string;
}

/** 「拉取模型」的结果。 */
export interface AiModelList {
  ok: boolean;
  models: string[];
  error?: string;
}

/** 「测试连接」的结果：真的发一句话给接口。 */
export interface AiConnectionTest {
  ok: boolean;
  model: string;
  latencyMs: number;
  reply: string;
  error?: string;
}

export const MIN_AI_OBSERVE_INTERVAL_MINUTES = 5;
export const MAX_AI_OBSERVE_INTERVAL_MINUTES = 30;
export const AI_PERSONA_TEXT_LIMIT = 500;
export const AI_REPLY_TEXT_LIMIT = 110;
export const OBSERVATION_TEXT_LIMIT = 120;
export const AI_MODEL_LIST_LIMIT = 60;
export const AI_TEMPERATURE = 0.9;
/** 思维型模型（如 deepseek-v4.1-flash）的推理 token 也算在 max_tokens 里。 */
export const AI_MAX_TOKENS = 512;
export const AI_REQUEST_TIMEOUT_MS = 30_000;
export const DEFAULT_TTS_VOICE = 'Microsoft Huihui Desktop';
/** 本机 GPT-SoVITS api_v2 的默认地址。 */
export const DEFAULT_TTS_API_URL = 'http://127.0.0.1:9880';
/** 克隆音色要跑一次推理，给足时间。 */
export const TTS_CLONE_TIMEOUT_MS = 90_000;
export const TTS_PROMPT_TEXT_LIMIT = 200;
export const TTS_REF_AUDIO_HINT = '例如 D:\\GPT-SoVITS\\ref\\hutao-8s.wav';

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  autoObserveEnabled: true,
  observeIntervalMinutes: 8,
  voiceEnabled: true,
  apiBaseUrl: 'https://opencode.ai/inference/go/v1',
  textModel: 'deepseek-v4.1-flash',
  ttsEngine: 'system',
  ttsVoice: DEFAULT_TTS_VOICE,
  ttsApiUrl: DEFAULT_TTS_API_URL,
  ttsRefAudio: '',
  ttsPromptText: '',
  ttsPromptLang: 'zh',
  ttsTextLang: 'zh',
  persona:
    '你是《原神》里的往生堂第七十七代堂主胡桃，也是这个本地桌宠里的胡桃。你古灵精怪、活泼俏皮，自称本堂主，喜欢押韵和小巷派暗黑打油诗。语气轻快、有陪伴感，可以偶尔来一句短短的打油诗，但不要阴森吓人。'
};

/** 旧版 MiniMax 端点，仅用于把老配置迁移到新默认值。 */
export const LEGACY_MINIMAX_API_BASE_URL = 'https://api.minimax.io/v1';
export const LEGACY_MINIMAX_API_HOSTS = ['api.minimaxi.com', 'api.minimax.io'];
