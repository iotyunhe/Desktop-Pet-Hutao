import { isWithinQuietHours } from '../../../shared/bilibili';
import {
  QQ_CONTEXT_TTL_MS,
  QQ_RECENT_REPLIES_LIMIT,
  QQ_REPLY_WINDOW_MS,
  type QqConnectionState,
  type QqGroupInfo,
  type QqReplyLog,
  type QqSettings,
  type QqSettingsPatch,
  type QqStatus,
  type QqTrigger
} from '../../../shared/qq';
import type { AiService } from '../ai/ai-service';
import type { Logger } from '../../util/logger';
import { formatDateKey, getMinutesOfDay } from '../../util/time';
import type { QqSettingsStore } from '../../storage/qq-store';
import {
  buildGroupSystemPrompt,
  buildGroupUserPrompt,
  estimateTypingDelayMs,
  parseGroupMessage,
  sanitizeGroupReply,
  splitIntoBubbles,
  type ChatLine
} from './message-composer';
import { decideGroupReply, type GroupReplyState } from './reply-decider';
import { OneBotGateway, type OneBotEvent } from './onebot-gateway';

export interface QqServiceOptions {
  settings: QqSettingsStore;
  ai: AiService;
  logger: Logger;
  random?: () => number;
  /** 测试注入用，默认真的起 WebSocket 服务。 */
  gatewayFactory?: (options: { port: number; accessToken: string; logger: Logger }) => OneBotGateway;
  now?: () => number;
}

interface GroupContext {
  lines: ChatLine[];
  updatedAt: number;
}

interface GroupRuntimeState extends GroupReplyState {
  groupName: string;
}

/** 没配好大模型时的兜底台词，避免群友发现「已读不回」其实是程序挂了。 */
const FALLBACK_AT_REPLIES = ['在的在的，本堂主听着呢～', '来啦，刚刚在打盹儿。', '嗯？叫本堂主干嘛呀。'];
const FALLBACK_INTERJECT_REPLIES = ['这个话题有点意思。', '本堂主路过，顺便听一耳朵。'];

const CONNECTION_POLL_MS = 3_000;

/**
 * QQ 群聊板块：本机起 OneBot 反向 WS，按「@ 必回 / 概率插话」的规则决定接不接话，
 * 再用大模型写一句人话发回群里。
 */
export class QqService {
  private gateway: OneBotGateway | null = null;
  private gatewayPort: number | null = null;
  private gatewayToken = '';
  private pollTimer: NodeJS.Timeout | null = null;
  private statusListener: ((status: QqStatus) => void) | null = null;

  private state: QqConnectionState = 'disabled';
  private botNickname = '';
  private connectedAt: string | null = null;
  private lastError: string | null = null;
  private lastMessageAt: string | null = null;
  private groups: QqGroupInfo[] = [];
  private recentReplies: QqReplyLog[] = [];
  private replyCount = 0;
  private replyDateKey = formatDateKey(new Date());

  private readonly groupStates = new Map<number, GroupRuntimeState>();
  private readonly contexts = new Map<number, GroupContext>();
  private readonly random: () => number;
  private readonly now: () => number;

  constructor(private readonly options: QqServiceOptions) {
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
  }

  onStatus(listener: (status: QqStatus) => void): void {
    this.statusListener = listener;
  }

  getStatus(): QqStatus {
    const settings = this.options.settings.get();
    const today = formatDateKey(new Date(this.now()));
    if (today !== this.replyDateKey) {
      this.replyDateKey = today;
      this.replyCount = 0;
    }

    return {
      state: settings.enabled ? this.state : 'disabled',
      settings,
      botNickname: this.botNickname,
      connectedAt: this.connectedAt,
      lastError: this.lastError,
      lastMessageAt: this.lastMessageAt,
      todayReplies: this.replyCount,
      groups: this.groups,
      recentReplies: this.recentReplies,
      listenUrl: `ws://127.0.0.1:${settings.wsPort}/ws`
    };
  }

  async updateSettings(patch: QqSettingsPatch): Promise<QqStatus> {
    const before = this.options.settings.get();
    const after = this.options.settings.update(patch);
    this.emitStatus();

    const needsRestart =
      before.enabled !== after.enabled || before.wsPort !== after.wsPort || before.accessToken !== after.accessToken;

    if (needsRestart) {
      await this.restart();
    } else if (!after.enabled) {
      await this.restart();
    }

    return this.getStatus();
  }

  async connect(): Promise<QqStatus> {
    const settings = this.options.settings.get();
    if (!settings.enabled) {
      this.lastError = 'QQ 板块还没启用，先把开关打开。';
      this.state = 'disabled';
      this.emitStatus();
      return this.getStatus();
    }

    const sameGateway =
      this.gateway && this.gatewayPort === settings.wsPort && this.gatewayToken === settings.accessToken;
    if (sameGateway) {
      this.emitStatus();
      return this.getStatus();
    }

    await this.disposeGateway();

    const factory =
      this.options.gatewayFactory ??
      ((gatewayOptions) =>
        new OneBotGateway({
          ...gatewayOptions,
          logger: this.options.logger
        }));

    const gateway = factory({
      port: settings.wsPort,
      accessToken: settings.accessToken,
      logger: this.options.logger
    });
    gateway.onEvent((event) => {
      void this.handleEvent(event);
    });

    this.state = 'connecting';
    this.lastError = null;
    this.emitStatus();

    try {
      await gateway.start();
      this.gateway = gateway;
      this.gatewayPort = settings.wsPort;
      this.gatewayToken = settings.accessToken;
      this.options.logger.info('QQ 反向 WS 已启动', { url: gateway.listenUrl });
    } catch (error) {
      this.gateway = null;
      this.gatewayPort = null;
      this.state = 'error';
      this.lastError = error instanceof Error ? error.message : '启动 QQ 反向 WS 失败。';
      this.options.logger.error('启动 QQ 反向 WS 失败', error);
    }

    this.startPolling();
    this.emitStatus();
    return this.getStatus();
  }

  async disconnect(): Promise<QqStatus> {
    await this.disposeGateway();
    this.state = this.options.settings.get().enabled ? 'connecting' : 'disabled';
    this.emitStatus();
    return this.getStatus();
  }

  async refreshGroups(): Promise<QqGroupInfo[]> {
    const gateway = this.gateway;
    if (!gateway || !gateway.online) {
      this.lastError = '协议端还没连上，先确认 SnowLuma 已启动并连上端口。';
      this.emitStatus();
      return this.groups;
    }

    try {
      const list = await gateway.call<Array<{ group_id?: number; group_name?: string; member_count?: number }>>(
        'get_group_list'
      );
      this.groups = (list ?? [])
        .map((item) => ({
          groupId: Number(item?.group_id ?? 0),
          groupName: typeof item?.group_name === 'string' ? item.group_name : `群 ${item?.group_id ?? ''}`,
          memberCount: Number(item?.member_count ?? 0)
        }))
        .filter((item) => item.groupId > 0)
        .sort((left, right) => left.groupName.localeCompare(right.groupName, 'zh-CN'));
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : '拉取群列表失败。';
    }

    this.emitStatus();
    return this.groups;
  }

  async dispose(): Promise<void> {
    await this.disposeGateway();
  }

  private async restart(): Promise<void> {
    await this.disposeGateway();
    const settings = this.options.settings.get();
    if (settings.enabled) {
      await this.connect();
    } else {
      this.state = 'disabled';
      this.emitStatus();
    }
  }

  private async disposeGateway(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    const gateway = this.gateway;
    this.gateway = null;
    this.gatewayPort = null;
    this.gatewayToken = '';

    if (gateway) {
      try {
        await gateway.stop();
      } catch {
        // 关闭失败不影响后续重启。
      }
    }

    if (this.state === 'online' || this.state === 'error') {
      this.state = this.options.settings.get().enabled ? 'connecting' : 'disabled';
    }
    this.connectedAt = null;
  }

  private startPolling(): void {
    if (this.pollTimer) {
      return;
    }

    this.pollTimer = setInterval(() => {
      void this.syncConnectionState();
    }, CONNECTION_POLL_MS);
    this.pollTimer.unref?.();
  }

  private async syncConnectionState(): Promise<void> {
    const gateway = this.gateway;
    if (!gateway) {
      return;
    }

    if (gateway.online && this.state !== 'online') {
      this.state = 'online';
      this.connectedAt = new Date().toISOString();
      this.lastError = null;
      this.emitStatus();
      await this.loadBotIdentity();
      await this.refreshGroups();
      return;
    }

    if (!gateway.online && this.state === 'online') {
      this.state = 'connecting';
      this.connectedAt = null;
      this.emitStatus();
    }
  }

  private async loadBotIdentity(): Promise<void> {
    const gateway = this.gateway;
    if (!gateway) {
      return;
    }

    try {
      const info = await gateway.call<{ user_id?: number; nickname?: string }>('get_login_info');
      if (info?.nickname) {
        this.botNickname = info.nickname;
        this.emitStatus();
      }
    } catch {
      // 拿不到昵称不影响聊天，用默认名兜底。
    }
  }

  private async handleEvent(event: OneBotEvent): Promise<void> {
    if (event.post_type === 'meta_event') {
      if (event.meta_event_type === 'lifecycle') {
        await this.syncConnectionState();
      }
      return;
    }

    if (event.post_type === 'message' && event.message_type === 'group') {
      await this.handleGroupMessage(event);
    }
  }

  private async handleGroupMessage(event: OneBotEvent): Promise<void> {
    const settings = this.options.settings.get();
    if (!settings.enabled) {
      return;
    }

    const groupId = Number(event.group_id ?? 0);
    if (!groupId || !settings.allowedGroups.includes(groupId)) {
      return;
    }

    const selfId = Number(event.self_id ?? 0);
    const userId = Number(event.user_id ?? event.sender?.user_id ?? 0);
    if (selfId > 0 && userId === selfId) {
      return;
    }

    const parsed = parseGroupMessage(event.message ?? event.raw_message ?? '', selfId, this.getBotNames());
    this.lastMessageAt = new Date().toISOString();

    const nickname = this.getSenderName(event);
    const context = this.getContext(groupId);
    context.lines.push({ nickname, text: parsed.text || '[非文字消息]', at: this.now() });
    if (context.lines.length > 40) {
      context.lines.splice(0, context.lines.length - 40);
    }
    context.updatedAt = this.now();

    if (this.isQuietTime(settings)) {
      return;
    }

    const state = this.getGroupState(groupId, settings);
    const decision = decideGroupReply(
      {
        userId,
        selfId,
        text: parsed.text,
        atMe: parsed.atMe,
        mentionsName: parsed.mentionsName
      },
      {
        now: this.now(),
        replyToAt: settings.replyToAt,
        nameReplyChance: settings.nameReplyChance,
        interjectChance: settings.interjectChance,
        interjectCooldownMs: settings.interjectCooldownMinutes * 60_000,
        maxRepliesInWindow: settings.maxRepliesPer10Minutes,
        windowMs: QQ_REPLY_WINDOW_MS,
        state,
        random: this.random
      }
    );

    if (!decision.reply) {
      return;
    }

    await this.replyToGroup({
      groupId,
      groupName: state.groupName,
      trigger: decision.trigger,
      speaker: nickname,
      text: parsed.text,
      settings,
      state
    });
  }

  private async replyToGroup(options: {
    groupId: number;
    groupName: string;
    trigger: QqTrigger;
    speaker: string;
    text: string;
    settings: QqSettings;
    state: GroupRuntimeState;
  }): Promise<void> {
    const gateway = this.gateway;
    if (!gateway || !gateway.online) {
      return;
    }

    const triggerLabel =
      options.trigger === 'at' ? '被@了' : options.trigger === 'name' ? '有人叫了胡桃的名字' : '只是随手接一句';

    const generated = await this.options.ai.generate({
      system: buildGroupSystemPrompt({
        persona: options.settings.persona || this.options.ai.getStatus().settings.persona,
        botName: this.botNickname || '胡桃',
        allowAtReply: options.settings.replyToAt
      }),
      user: buildGroupUserPrompt({
        groupName: options.groupName,
        lines: this.getContext(options.groupId).lines,
        trigger: triggerLabel,
        speaker: options.speaker,
        text: options.text
      }),
      maxChars: 60,
      maxTokens: 320
    });

    const fallback =
      options.trigger === 'interject'
        ? FALLBACK_INTERJECT_REPLIES[Math.floor(this.random() * FALLBACK_INTERJECT_REPLIES.length)]
        : FALLBACK_AT_REPLIES[Math.floor(this.random() * FALLBACK_AT_REPLIES.length)];
    const replyText = sanitizeGroupReply(generated ?? fallback, options.trigger === 'interject' ? 50 : 90);

    if (!replyText) {
      return;
    }

    const bubbles = splitIntoBubbles(replyText, this.random, options.trigger === 'interject' ? 1 : 3);
    try {
      for (const [index, bubble] of bubbles.entries()) {
        await sleep(index === 0 ? estimateTypingDelayMs(bubble, this.random) : 700 + this.random() * 1600);
        await gateway.call('send_group_msg', {
          group_id: options.groupId,
          message: [{ type: 'text', data: { text: bubble } }]
        });
      }
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : '发送群消息失败。';
      this.emitStatus();
      return;
    }

    const at = new Date().toISOString();
    options.state.lastReplyAt = this.now();
    options.state.replyTimes.push(this.now());
    this.recordReply({
      groupId: options.groupId,
      groupName: options.groupName,
      text: bubbles.join(' / '),
      at,
      trigger: options.trigger
    });
  }

  private recordReply(log: QqReplyLog): void {
    this.recentReplies.unshift(log);
    if (this.recentReplies.length > QQ_RECENT_REPLIES_LIMIT) {
      this.recentReplies.length = QQ_RECENT_REPLIES_LIMIT;
    }

    const today = formatDateKey(new Date(this.now()));
    if (today !== this.replyDateKey) {
      this.replyDateKey = today;
      this.replyCount = 0;
    }
    this.replyCount += 1;
    this.emitStatus();
  }

  private getBotNames(): string[] {
    const names = [this.botNickname, '胡桃'].filter((name): name is string => Boolean(name && name.trim()));
    return Array.from(new Set(names));
  }

  private getSenderName(event: OneBotEvent): string {
    const card = typeof event.sender?.card === 'string' ? event.sender.card.trim() : '';
    const nickname = typeof event.sender?.nickname === 'string' ? event.sender.nickname.trim() : '';
    return (card || nickname || '群友').slice(0, 20);
  }

  private getContext(groupId: number): GroupContext {
    const existing = this.contexts.get(groupId);
    if (existing && this.now() - existing.updatedAt < QQ_CONTEXT_TTL_MS) {
      return existing;
    }

    const fresh: GroupContext = { lines: [], updatedAt: this.now() };
    this.contexts.set(groupId, fresh);
    return fresh;
  }

  private getGroupState(groupId: number, settings: QqSettings): GroupRuntimeState {
    const existing = this.groupStates.get(groupId);
    if (existing) {
      existing.groupName =
        this.groups.find((group) => group.groupId === groupId)?.groupName || existing.groupName || `群 ${groupId}`;
      return existing;
    }

    const created: GroupRuntimeState = {
      lastReplyAt: 0,
      replyTimes: [],
      groupName: this.groups.find((group) => group.groupId === groupId)?.groupName || `群 ${groupId}`
    };
    this.groupStates.set(groupId, created);
    return created;
  }

  private isQuietTime(settings: QqSettings): boolean {
    if (!settings.quietHoursEnabled) {
      return false;
    }

    return isWithinQuietHours(getMinutesOfDay(new Date(this.now())), settings.quietHoursStart, settings.quietHoursEnd);
  }

  private emitStatus(): void {
    this.statusListener?.(this.getStatus());
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
