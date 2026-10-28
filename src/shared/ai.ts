export type AiReplySource = 'chat' | 'desktop-observation' | 'system';

export interface AiSettings {
  enabled: boolean;
  autoObserveEnabled: boolean;
  observeIntervalMinutes: number;
  voiceEnabled: boolean;
  apiBaseUrl: string;
  textModel: string;
  ttsModel: string;
  voiceId: string;
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

export const MIN_AI_OBSERVE_INTERVAL_MINUTES = 5;
export const MAX_AI_OBSERVE_INTERVAL_MINUTES = 30;
export const AI_PERSONA_TEXT_LIMIT = 500;
export const AI_REPLY_TEXT_LIMIT = 110;
export const OBSERVATION_TEXT_LIMIT = 120;

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  autoObserveEnabled: true,
  observeIntervalMinutes: 8,
  voiceEnabled: true,
  apiBaseUrl: 'https://api.minimaxi.com/v1',
  textModel: 'MiniMax-M2.7',
  ttsModel: 'speech-2.8-turbo',
  voiceId: 'Chinese (Mandarin)_Cute_Spirit',
  persona:
    '你是《原神》里的往生堂第七十七代堂主胡桃，也是这个本地桌宠里的胡桃。你古灵精怪、活泼俏皮，自称本堂主，喜欢押韵和小巷派暗黑打油诗。语气轻快、有陪伴感，可以偶尔来一句短短的打油诗，但不要阴森吓人。'
};

/** 旧版 MiniMax 域名，会在归一化时自动迁移到新域名。 */
export const LEGACY_MINIMAX_API_BASE_URL = 'https://api.minimax.io/v1';
