export type QqConnectionState = 'disabled' | 'connecting' | 'online' | 'error';

/** 触发原因，用于面板展示与频率统计。 */
export type QqTrigger = 'at' | 'name' | 'interject';

export interface QqSettings {
  enabled: boolean;
  /** 本机反向 WS 端口，SnowLuma 的 ws://127.0.0.1:<port>/ws 要指到这里。 */
  wsPort: number;
  /** 反向 WS 鉴权 token，留空表示不校验（仅本机监听）。 */
  accessToken: string;
  /** 记录一下小号号码，仅用于面板显示。 */
  selfQq: string;
  /** 只在这些群里说话；留空表示一个群都不理。 */
  allowedGroups: number[];
  /** @ 必回。 */
  replyToAt: boolean;
  /** 被叫到名字时的回复概率（0-100）。 */
  nameReplyChance: number;
  /** 普通聊天时插话的概率（0-100）。 */
  interjectChance: number;
  /** 同一个群两次主动发言的最小间隔（分钟）。 */
  interjectCooldownMinutes: number;
  /** 10 分钟窗口内最多说几句，防止刷屏。 */
  maxRepliesPer10Minutes: number;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  /** 群聊专用人设，留空则沿用 AI 面板里的胡桃人设。 */
  persona: string;
}

export type QqSettingsPatch = Partial<QqSettings>;

export interface QqGroupInfo {
  groupId: number;
  groupName: string;
  memberCount: number;
}

export interface QqReplyLog {
  groupId: number;
  groupName: string;
  text: string;
  at: string;
  trigger: QqTrigger;
}

export interface QqStatus {
  state: QqConnectionState;
  settings: QqSettings;
  botNickname: string;
  connectedAt: string | null;
  lastError: string | null;
  lastMessageAt: string | null;
  todayReplies: number;
  groups: QqGroupInfo[];
  recentReplies: QqReplyLog[];
  /** 当前实际监听的地址，面板直接显示，方便对着 SnowLuma 填。 */
  listenUrl: string;
}

export const DEFAULT_QQ_SETTINGS: QqSettings = {
  enabled: false,
  wsPort: 6700,
  accessToken: '',
  selfQq: '',
  allowedGroups: [],
  replyToAt: true,
  nameReplyChance: 70,
  interjectChance: 8,
  interjectCooldownMinutes: 4,
  maxRepliesPer10Minutes: 4,
  quietHoursEnabled: true,
  quietHoursStart: '01:00',
  quietHoursEnd: '08:00',
  persona: ''
};

export const MIN_QQ_PORT = 1024;
export const MAX_QQ_PORT = 65535;
export const MAX_QQ_GROUPS = 20;
export const MAX_QQ_REPLY_TEXT = 120;
export const QQ_REPLY_WINDOW_MS = 10 * 60_000;
export const QQ_CONTEXT_MESSAGES = 16;
export const QQ_CONTEXT_TTL_MS = 10 * 60_000;
export const QQ_RECENT_REPLIES_LIMIT = 12;
/** 连不上协议端时的重试节奏。 */
export const QQ_RECONNECT_MS = 5_000;
