import { AI_REPLY_TEXT_LIMIT, type AiConnectionTest, type AiMessageRequest, type AiModelList, type AiReply, type AiSettingsPatch, type AiStatus } from '../../../shared/ai';
import type { BilibiliVideo } from '../../../shared/bilibili';
import type { AiSettingsStore, LlmKeyStore } from '../../storage/ai-store';
import type { Logger } from '../../util/logger';
import { ChatClient, limitReplyText } from './chat-client';
import { DesktopObserver } from './desktop-observer';
import { SystemTts, type TtsVoiceList } from './system-tts';

export interface AiServiceOptions {
  settings: AiSettingsStore;
  keys: LlmKeyStore;
  client: ChatClient;
  observer: DesktopObserver;
  tts: SystemTts;
  logger: Logger;
}

export interface GenerateOptions {
  system: string;
  user: string;
  maxChars?: number;
  temperature?: number;
  maxTokens?: number;
}

const VOICE_TEST_TEXT = '嘿嘿，本堂主试音营业中。';
const CONNECTION_TEST_PROMPT = '用一句 12 字以内的话跟桌宠的主人打个招呼，要有精神一点。';

/**
 * AI 互动门面：把「配置 / Key / 对话 / 观察 / 语音」收在一处。
 * 具体是哪家模型由 chat-client 的 base URL 决定，这一层不认识厂商。
 */
export class AiService {
  private lastError: string | null = null;

  constructor(private readonly options: AiServiceOptions) {}

  getStatus(): AiStatus {
    const observer = this.options.observer;
    const keys = this.options.keys;

    return {
      settings: this.options.settings.get(),
      hasApiKey: Boolean(keys.read()),
      keySource: keys.source(),
      encryptionAvailable: keys.isEncryptionAvailable(),
      lastObservedAt: observer.getLastObservedAt(),
      lastObservedTitle: observer.getLastObservedTitle(),
      lastError: this.lastError ?? observer.getLastError()
    };
  }

  saveKey(key: string): AiStatus {
    if (!this.options.keys.isEncryptionAvailable()) {
      this.lastError = '当前系统不可用 Electron safeStorage，无法安全保存 Key。';
      return this.getStatus();
    }

    if (!key.trim()) {
      this.lastError = 'API Key 不能为空。';
      return this.getStatus();
    }

    if (!this.options.keys.save(key)) {
      this.lastError = '保存 API Key 失败，请重试。';
      return this.getStatus();
    }

    this.lastError = null;
    return this.getStatus();
  }

  clearKey(): AiStatus {
    this.options.keys.clear();
    this.lastError = null;
    return this.getStatus();
  }

  updateSettings(patch: AiSettingsPatch): AiStatus {
    this.options.settings.update(patch);
    this.lastError = null;
    return this.getStatus();
  }

  async listModels(): Promise<AiModelList> {
    const apiKey = this.options.keys.read();
    if (!apiKey) {
      return { ok: false, models: [], error: '还没有配置 API Key。' };
    }

    return this.options.client.listModels(apiKey);
  }

  async listVoices(): Promise<TtsVoiceList> {
    return this.options.tts.listVoices();
  }

  /** 真的打一次接口，让人看到延迟和模型回的话，而不是「保存成功」。 */
  async testConnection(): Promise<AiConnectionTest> {
    const settings = this.options.settings.get();
    const apiKey = this.options.keys.read();
    const startedAt = Date.now();

    if (!apiKey) {
      return { ok: false, model: settings.textModel, latencyMs: 0, reply: '', error: '还没有配置 API Key。' };
    }

    try {
      const reply = await this.options.client.chat({
        apiKey,
        model: settings.textModel,
        system: '你是一个接入测试助手，只回一句话。',
        user: CONNECTION_TEST_PROMPT,
        temperature: 0.6,
        maxTokens: 160
      });

      this.lastError = null;
      return {
        ok: true,
        model: settings.textModel,
        latencyMs: Date.now() - startedAt,
        reply
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '连接测试失败。';
      this.lastError = message;
      return { ok: false, model: settings.textModel, latencyMs: Date.now() - startedAt, reply: '', error: message };
    }
  }

  async sendMessage(request: AiMessageRequest): Promise<AiReply> {
    const text = typeof request?.text === 'string' ? request.text.trim() : '';
    const settings = this.options.settings.get();

    if (!settings.enabled) {
      return this.systemReply('AI 互动还没开启，先在面板里打开开关吧。');
    }

    if (!text) {
      return this.systemReply('你还没告诉本堂主要聊什么呢。');
    }

    const apiKey = this.options.keys.read();
    if (!apiKey) {
      return this.systemReply('还没有配置 API Key，先在 AI 面板里填一个。');
    }

    try {
      const replyText = await this.options.client.chat({
        apiKey,
        model: settings.textModel,
        system: this.buildSystemPrompt(),
        user: text
      });
      this.lastError = null;
      return this.attachVoiceIfEnabled({ ok: true, source: 'chat', text: replyText });
    } catch (error) {
      const message = error instanceof Error ? error.message : '对话失败。';
      this.options.logger.warn('大模型对话失败', message);
      return this.systemReply('模型那边有点忙，本堂主先记下这句话。', message);
    }
  }

  async observeDesktop(): Promise<AiReply> {
    const settings = this.options.settings.get();
    if (!settings.enabled) {
      return this.systemReply('AI 互动还没开启，暂时不观察桌面。');
    }

    const apiKey = this.options.keys.read();
    if (!apiKey) {
      return this.systemReply('还没有配置 API Key，先在 AI 面板里填一个。');
    }

    const observation = await this.options.observer.read();
    if (!observation) {
      return this.systemReply('我刚刚没看清当前窗口，稍后再试试。', this.lastError ?? undefined);
    }

    if (this.options.observer.isRecentDuplicate(observation, settings.observeIntervalMinutes)) {
      return {
        ok: false,
        source: 'desktop-observation',
        text: '这扇窗口我刚刚看过啦，先不重复打扰你。',
        observed: observation
      };
    }

    try {
      const replyText = await this.options.client.chat({
        apiKey,
        model: settings.textModel,
        system: this.buildSystemPrompt(),
        user: [
          '请根据当前活动窗口信息，给用户一句轻松、短促的陪伴反馈。',
          `应用：${observation.appName}`,
          `标题：${observation.title}`,
          `观察时间：${observation.observedAt}`
        ].join('\n')
      });

      this.options.observer.markReplied(observation);
      this.lastError = null;
      return this.attachVoiceIfEnabled({
        ok: true,
        source: 'desktop-observation',
        text: replyText,
        observed: observation
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '桌面观察回复失败。';
      this.options.observer.setError(message);
      return this.systemReply(
        `我看到你现在在 ${observation.appName}：${observation.title}。不过模型暂时没接上话。`,
        message
      );
    }
  }

  async testVoice(): Promise<AiReply> {
    const settings = this.options.settings.get();
    if (!settings.enabled) {
      return this.systemReply('AI 互动还没开启，先打开开关再试音吧。');
    }

    if (settings.ttsEngine !== 'system') {
      return this.systemReply('语音播报现在是关闭的，先在配置里打开。');
    }

    try {
      const audio = await this.options.tts.speak(VOICE_TEST_TEXT, settings.ttsVoice);
      this.lastError = null;
      return {
        ok: true,
        source: 'system',
        text: `语音测试成功，当前音色：${audio.voice}。`,
        audioBase64: audio.audioBase64,
        audioMimeType: audio.mimeType
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '语音测试失败。';
      this.options.logger.warn('系统语音测试失败', message);
      return this.systemReply(`语音测试失败：${message}`, message);
    }
  }

  /**
   * 给其它模块（B 站分享、QQ 群聊）用的通用生成入口。
   * 关闭 AI 或没有 Key 时返回 null，调用方自己决定降级文案。
   */
  async generate(options: GenerateOptions): Promise<string | null> {
    const settings = this.options.settings.get();
    if (!settings.enabled) {
      return null;
    }

    const apiKey = this.options.keys.read();
    if (!apiKey) {
      return null;
    }

    try {
      const text = await this.options.client.chat({
        apiKey,
        model: settings.textModel,
        system: options.system,
        user: options.user,
        temperature: options.temperature,
        maxTokens: options.maxTokens
      });

      this.lastError = null;
      return limitReplyText(text, options.maxChars ?? AI_REPLY_TEXT_LIMIT);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : '生成失败。';
      this.options.logger.warn('大模型生成失败', this.lastError ?? '');
      return null;
    }
  }

  /**
   * B 站分享时，如果 AI 已配置，就让胡桃现写一句推荐语。
   * 只把标题 / 分区 / UP 主 / 播放量交给模型，不上传任何本地内容。
   */
  async writeVideoCommentary(video: BilibiliVideo, reason: string): Promise<string | null> {
    return this.generate({
      system: [
        this.buildSystemPrompt(),
        '现在你在给用户推荐一条 B 站视频。只根据给出的标题、UP 主、分区、播放量写一句推荐语。',
        '不要编造视频里的具体画面或情节，不要说“我看完了”，不要输出链接。'
      ].join('\n'),
      user: [
        `标题：${video.title}`,
        `UP 主：${video.upName}`,
        `分区：${video.category}`,
        `播放量：${video.viewCount}`,
        `推荐理由：${reason}`,
        '请用一句 40 字以内的话推荐它，带一点胡桃的古灵精怪。'
      ].join('\n'),
      maxChars: 56,
      temperature: 0.9,
      maxTokens: 120
    });
  }

  private buildSystemPrompt(): string {
    return [
      this.options.settings.get().persona,
      '你不是通用 AI 助手，而是本地桌宠里的胡桃。不要自称 AI。',
      '只用简体中文回复，1-2 句，最多 60 个汉字。',
      '可以俏皮、鼓励、提醒休息，但不要吓人、不要惩罚用户。',
      '如果给出的是窗口标题，只能说“看到窗口信息”，不要声称看到了截图或具体画面。',
      '不要输出 Markdown，不要输出表情包指令，不要输出 <think>。'
    ].join('\n');
  }

  private async attachVoiceIfEnabled(reply: AiReply): Promise<AiReply> {
    const settings = this.options.settings.get();
    if (!reply.ok || !settings.voiceEnabled || settings.ttsEngine === 'off') {
      return reply;
    }

    try {
      const audio = await this.options.tts.speak(reply.text, settings.ttsVoice);
      return {
        ...reply,
        audioBase64: audio.audioBase64,
        audioMimeType: audio.mimeType
      };
    } catch (error) {
      this.lastError = error instanceof Error ? `语音生成失败：${error.message}` : '语音生成失败。';
      return reply;
    }
  }

  private systemReply(text: string, error?: string): AiReply {
    if (error) {
      this.lastError = error;
    }

    return {
      ok: false,
      source: 'system',
      text,
      error
    };
  }
}
