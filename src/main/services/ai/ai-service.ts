import type { AiMessageRequest, AiReply, AiSettingsPatch, AiStatus } from '../../../shared/ai';
import type { BilibiliVideo } from '../../../shared/bilibili';
import type { AiSettingsStore, MiniMaxKeyStore } from '../../storage/ai-store';
import type { Logger } from '../../util/logger';
import { DesktopObserver } from './desktop-observer';
import { MiniMaxClient, limitReplyText } from './minimax-client';

export interface AiServiceOptions {
  settings: AiSettingsStore;
  keys: MiniMaxKeyStore;
  client: MiniMaxClient;
  observer: DesktopObserver;
  logger: Logger;
}

const VOICE_TEST_TEXT = '嘿嘿，本堂主试音营业中。';

/**
 * AI 互动门面：把「配置 / Key / 对话 / 观察 / 语音」收在一处，
 * 渲染层只看 status 与 reply，不需要知道 MiniMax 的细节。
 */
export class AiService {
  private lastError: string | null = null;

  constructor(private readonly options: AiServiceOptions) {}

  getStatus(): AiStatus {
    const observer = this.options.observer;

    return {
      settings: this.options.settings.get(),
      hasApiKey: Boolean(this.options.keys.read()),
      encryptionAvailable: this.options.keys.isEncryptionAvailable(),
      lastObservedAt: observer.getLastObservedAt(),
      lastObservedTitle: observer.getLastObservedTitle(),
      lastError: this.lastError ?? observer.getLastError()
    };
  }

  saveKey(key: string): AiStatus {
    if (!this.options.keys.isEncryptionAvailable()) {
      this.lastError = '当前系统不可用 Electron safeStorage，无法安全保存 MiniMax API Key。';
      return this.getStatus();
    }

    if (!key.trim()) {
      this.lastError = 'MiniMax API Key 不能为空。';
      return this.getStatus();
    }

    if (!this.options.keys.save(key)) {
      this.lastError = '保存 MiniMax API Key 失败，请重试。';
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
      return this.systemReply('还没有保存新的 MiniMax API Key，先配置一下吧。');
    }

    try {
      const replyText = await this.options.client.chat({
        apiKey,
        model: settings.textModel,
        system: this.buildSystemPrompt(),
        user: text
      });
      this.lastError = null;
      return this.attachVoiceIfEnabled(apiKey, {
        ok: true,
        source: 'chat',
        text: replyText
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'MiniMax 对话失败。';
      this.options.logger.warn('MiniMax 对话失败', message);
      return this.systemReply('MiniMax 那边有点忙，本堂主先记下这句话。', message);
    }
  }

  async observeDesktop(): Promise<AiReply> {
    const settings = this.options.settings.get();
    if (!settings.enabled) {
      return this.systemReply('AI 互动还没开启，暂时不观察桌面。');
    }

    const apiKey = this.options.keys.read();
    if (!apiKey) {
      return this.systemReply('还没有保存新的 MiniMax API Key，先配置一下吧。');
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
      return this.attachVoiceIfEnabled(apiKey, {
        ok: true,
        source: 'desktop-observation',
        text: replyText,
        observed: observation
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'MiniMax 桌面观察回复失败。';
      this.options.observer.setError(message);
      return this.systemReply(
        `我看到你现在在 ${observation.appName}：${observation.title}。不过 MiniMax 暂时没接上话。`,
        message
      );
    }
  }

  async testVoice(): Promise<AiReply> {
    const settings = this.options.settings.get();
    if (!settings.enabled) {
      return this.systemReply('AI 互动还没开启，先打开开关再试音吧。');
    }

    const apiKey = this.options.keys.read();
    if (!apiKey) {
      return this.systemReply('还没有保存新的 MiniMax API Key，先配置一下吧。');
    }

    try {
      const audioBase64 = await this.options.client.tts({
        apiKey,
        text: VOICE_TEST_TEXT,
        model: settings.ttsModel,
        voiceId: settings.voiceId
      });
      this.lastError = null;
      return {
        ok: true,
        source: 'system',
        text: '同步语音合成成功。',
        audioBase64,
        audioMimeType: 'audio/mpeg'
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '同步语音合成失败。';
      return this.systemReply(`语音测试失败：${message}`, message);
    }
  }

  /**
   * B 站分享时，如果 AI 已配置，就让胡桃现写一句推荐语。
   * 只把标题 / 分区 / UP 主 / 播放量交给模型，不上传任何本地内容。
   */
  async writeVideoCommentary(video: BilibiliVideo, reason: string): Promise<string | null> {
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
        temperature: 0.9,
        maxTokens: 120
      });

      return limitReplyText(text, 56);
    } catch (error) {
      this.options.logger.warn('B 站推荐语生成失败', error instanceof Error ? error.message : error);
      return null;
    }
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

  private async attachVoiceIfEnabled(apiKey: string, reply: AiReply): Promise<AiReply> {
    const settings = this.options.settings.get();
    if (!reply.ok || !settings.voiceEnabled) {
      return reply;
    }

    try {
      const audioBase64 = await this.options.client.tts({
        apiKey,
        text: reply.text,
        model: settings.ttsModel,
        voiceId: settings.voiceId
      });

      return {
        ...reply,
        audioBase64,
        audioMimeType: 'audio/mpeg'
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
