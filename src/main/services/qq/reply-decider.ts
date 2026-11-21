import type { QqTrigger } from '../../../shared/qq';

export interface GroupReplyState {
  lastReplyAt: number;
  replyTimes: number[];
}

export interface DecideGroupReplyOptions {
  now: number;
  replyToAt: boolean;
  nameReplyChance: number;
  interjectChance: number;
  interjectCooldownMs: number;
  maxRepliesInWindow: number;
  windowMs: number;
  state: GroupReplyState;
  random: () => number;
}

export interface GroupMessageFacts {
  userId: number;
  selfId: number;
  text: string;
  atMe: boolean;
  mentionsName: boolean;
}

export type GroupReplyDecision =
  | { reply: false; reason: 'self' | 'empty' | 'cooling' | 'rate-limited' | 'random' }
  | { reply: true; trigger: QqTrigger };

/** 只保留窗口内的发言时间，顺便把过期记录丢掉。 */
export function pruneReplyTimes(times: number[], now: number, windowMs: number): number[] {
  return times.filter((at) => now - at < windowMs);
}

/**
 * 决定这条群消息要不要接话。
 * 纯函数：随机数由调用方注入，方便单测。
 */
export function decideGroupReply(
  facts: GroupMessageFacts,
  options: DecideGroupReplyOptions
  ): GroupReplyDecision {
  if (facts.selfId > 0 && facts.userId === facts.selfId) {
    return { reply: false, reason: 'self' };
  }

  if (!facts.text.trim() && !facts.atMe) {
    return { reply: false, reason: 'empty' };
  }

  const recent = pruneReplyTimes(options.state.replyTimes, options.now, options.windowMs);
  const overLimit = recent.length >= options.maxRepliesInWindow;

  // 被 @ 就是被点名了，这个必须回，不受冷却和条数限制。
  if (facts.atMe && options.replyToAt) {
    return { reply: true, trigger: 'at' };
  }

  if (overLimit) {
    return { reply: false, reason: 'rate-limited' };
  }

  if (facts.mentionsName) {
    if (options.random() * 100 < options.nameReplyChance) {
      return { reply: true, trigger: 'name' };
    }
    return { reply: false, reason: 'random' };
  }

  if (options.now - options.state.lastReplyAt < options.interjectCooldownMs) {
    return { reply: false, reason: 'cooling' };
  }

  if (options.random() * 100 < options.interjectChance) {
    return { reply: true, trigger: 'interject' };
  }

  return { reply: false, reason: 'random' };
}
