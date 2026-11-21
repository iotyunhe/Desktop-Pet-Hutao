export type AiReplySource = 'chat' | 'desktop-observation' | 'system' | 'qq-group';

/** 语音走本机 Windows SAPI（无需 Key），或彻底关闭。 */
export type TtsEngine = 'system' | 'off';

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

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  autoObserveEnabled: true,
  observeIntervalMinutes: 8,
  voiceEnabled: true,
  apiBaseUrl: 'https://opencode.ai/inference/go/v1',
  textModel: 'deepseek-v4.1-flash',
  ttsEngine: 'system',
  ttsVoice: DEFAULT_TTS_VOICE,
  persona:
    '你是《原神》里的往生堂第七十七代堂主胡桃，也是这个本地桌宠里的胡桃。你古灵精怪、活泼俏皮，自称本堂主，喜欢押韵和小巷派暗黑打油诗。语气轻快、有陪伴感，可以偶尔来一句短短的打油诗，但不要阴森吓人。'
};

/** 旧版 MiniMax 端点，仅用于把老配置迁移到新默认值。 */
export const LEGACY_MINIMAX_API_BASE_URL = 'https://api.minimax.io/v1';
export const LEGACY_MINIMAX_API_HOSTS = ['api.minimaxi.com', 'api.minimax.io'];
