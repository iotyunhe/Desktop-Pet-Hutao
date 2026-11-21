import { MAX_QQ_REPLY_TEXT, QQ_CONTEXT_MESSAGES } from '../../../shared/qq';
import type { BilibiliVideo } from '../../../shared/bilibili';

export interface ParsedGroupMessage {
  text: string;
  atMe: boolean;
  atAll: boolean;
  mentionsName: boolean;
  imageCount: number;
  replyToId: number | null;
  /** 纯文本里是否还有值得回复的内容。 */
  meaningful: boolean;
}

export interface ChatLine {
  nickname: string;
  text: string;
  at: number;
}

const URL_PATTERN = /https?:\/\/\S+/gi;
// 每项是「正则 + 替换值」：纯符号删掉，Markdown 链接只留文字。
const MARKDOWN_PATTERNS: Array<[RegExp, string]> = [
  [/[*_`>#]/g, ''],
  [/\[([^\]]*)\]\([^)]*\)/g, '$1']
];

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function getString(record: Record<string, unknown> | null, key: string): string {
  const value = record?.[key];
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
}

/**
 * 把 OneBot 的 message 数组（或 CQ 码字符串）拆成文本与 @ 信息。
 * 图片/表情/语音只留占位符，避免把二进制内容塞给模型。
 */
export function parseGroupMessage(
  message: unknown,
  selfId: number,
  botNames: string[]
): ParsedGroupMessage {
  let text = '';
  let atMe = false;
  let atAll = false;
  let imageCount = 0;
  let replyToId: number | null = null;

  if (typeof message === 'string') {
    text = message
      .replace(/\[CQ:at,qq=all\]/g, () => {
        atAll = true;
        return '@全体成员';
      })
      .replace(/\[CQ:at,qq=(\d+)\]/g, (_match, qq: string) => {
        if (Number(qq) === selfId) {
          atMe = true;
          return '@胡桃';
        }
        return '@群友';
      })
      .replace(/\[CQ:image[^\]]*\]/g, () => {
        imageCount += 1;
        return '[图片]';
      })
      .replace(/\[CQ:face[^\]]*\]/g, '[表情]')
      .replace(/\[CQ:record[^\]]*\]/g, '[语音]')
      .replace(/\[CQ:reply,id=(-?\d+)[^\]]*\]/g, (_match, id: string) => {
        replyToId = Number(id);
        return '';
      });
  } else if (Array.isArray(message)) {
    for (const segment of message) {
      const record = getRecord(segment);
      const type = getString(record, 'type');
      const data = getRecord(record?.data);

      if (type === 'text') {
        text += getString(data, 'text');
      } else if (type === 'at') {
        const qq = getString(data, 'qq');
        if (qq === 'all') {
          atAll = true;
          text += '@全体成员 ';
        } else if (Number(qq) === selfId) {
          atMe = true;
          text += '@胡桃 ';
        } else {
          text += '@群友 ';
        }
      } else if (type === 'image') {
        imageCount += 1;
        text += '[图片] ';
      } else if (type === 'face' || type === 'mface') {
        text += '[表情] ';
      } else if (type === 'record') {
        text += '[语音] ';
      } else if (type === 'reply') {
        const id = Number(getString(data, 'id'));
        replyToId = Number.isFinite(id) ? id : null;
      }
    }
  }

  const cleanText = text.replace(/\s+/g, ' ').trim();
  const mentionsName = botNames.some((name) => name.length > 0 && cleanText.includes(name));

  return {
    text: cleanText.slice(0, 400),
    atMe,
    atAll,
    mentionsName,
    imageCount,
    replyToId,
    meaningful: cleanText.replace(/\[(图片|表情|语音)\]/g, '').trim().length > 0
  };
}

/** 去掉 Markdown、链接、@全体，压成一句能在群里发的话。 */
export function sanitizeGroupReply(text: string, limit = MAX_QQ_REPLY_TEXT): string {
  let output = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(URL_PATTERN, '')
    .replace(/@全体成员|@all/gi, '')
    .replace(/\[图片\]|\[表情\]|\[语音\]/g, '');

  for (const [pattern, replacement] of MARKDOWN_PATTERNS) {
    output = output.replace(pattern, replacement);
  }

  output = output.replace(/\s+/g, ' ').trim();

  // 群里发「嗯」也要有个说话的边界，太长就按句子截。
  if (output.length > limit) {
    const cut = output.slice(0, limit);
    const lastPunctuation = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('！'), cut.lastIndexOf('？'), cut.lastIndexOf('，'));
    output = lastPunctuation >= limit * 0.5 ? cut.slice(0, lastPunctuation + 1) : `${cut.slice(0, limit - 1)}…`;
  }

  return output.trim();
}

/** 长回复拆成 1-3 条短消息，模仿真人打字节奏。 */
export function splitIntoBubbles(text: string, random: () => number, maxBubbles = 3): string[] {
  const clean = text.trim();
  if (!clean) {
    return [];
  }

  if (clean.length <= 40 || maxBubbles <= 1) {
    return [clean];
  }

  const sentences = clean
    .split(/(?<=[。！？!?~～])/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (sentences.length <= 1) {
    return [clean];
  }

  const bubbles: string[] = [];
  let buffer = '';
  for (const sentence of sentences) {
    if (buffer && buffer.length + sentence.length > 45) {
      bubbles.push(buffer);
      buffer = sentence;
    } else {
      buffer += sentence;
    }
  }
  if (buffer) {
    bubbles.push(buffer);
  }

  if (bubbles.length <= maxBubbles) {
    return bubbles;
  }

  // 太多就合并尾部，保证最多 maxBubbles 条。
  const head = bubbles.slice(0, maxBubbles - 1);
  head.push(bubbles.slice(maxBubbles - 1).join(''));
  return head;
}

/** 打字延迟：字越多越慢，加一点随机。 */
export function estimateTypingDelayMs(text: string, random: () => number): number {
  const base = text.length * 95 + random() * 900;
  return Math.round(Math.min(4600, Math.max(900, base)));
}

export function buildGroupSystemPrompt(options: {
  persona: string;
  botName: string;
  allowAtReply: boolean;
}): string {
  return [
    options.persona,
    `你现在在一个 QQ 群里聊天，群友叫你「${options.botName}」或者@你。`,
    '说话要像一个真人群友：短、口语、偶尔调皮，不要每句都精心设计。',
    '一次只说 1 句话，最多 40 个字；可以吐槽、可以接梗、可以只回半句。',
    '不要用 Markdown，不要用列表，不要输出链接，不要说自己是 AI 或机器人。',
    '不要主动提「我在这个群里」这类元信息，也不要复述别人刚说过的话。',
    '如果话题很严肃、涉及隐私、争吵或政治，就简短敷衍一句甚至不接话。',
    '不要连续复读同样的句式，不要每次都说「嘿嘿」或押韵。'
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildGroupUserPrompt(options: {
  groupName: string;
  lines: ChatLine[];
  trigger: string;
  speaker: string;
  text: string;
}): string {
  const transcript = options.lines
    .slice(-QQ_CONTEXT_MESSAGES)
    .map((line) => `${line.nickname}: ${line.text}`)
    .join('\n');

  return [
    `群名：${options.groupName}`,
    '最近的聊天记录：',
    transcript || '（暂无）',
    '',
    `刚刚 ${options.speaker} 说：${options.text}`,
    `触发原因：${options.trigger}`,
    '请只输出你要发到群里的那一句话，不要带昵称前缀，不要加引号。'
  ].join('\n');
}

/** 二期用：把 B 站视频塞进群里时的文案。 */
export function buildVideoShareLine(video: BilibiliVideo): string {
  return `【B站】${video.title}｜UP：${video.upName}｜${video.bvid}`;
}
