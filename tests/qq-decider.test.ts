import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decideGroupReply,
  pruneReplyTimes,
  type DecideGroupReplyOptions,
  type GroupMessageFacts
} from '../src/main/services/qq/reply-decider';

const SELF_ID = 10001;

function facts(overrides: Partial<GroupMessageFacts> = {}): GroupMessageFacts {
  return {
    userId: 20002,
    selfId: SELF_ID,
    text: '今天好热啊',
    atMe: false,
    mentionsName: false,
    ...overrides
  };
}

function options(overrides: Partial<DecideGroupReplyOptions> = {}): DecideGroupReplyOptions {
  return {
    now: 1_000_000,
    replyToAt: true,
    nameReplyChance: 70,
    interjectChance: 8,
    interjectCooldownMs: 4 * 60_000,
    maxRepliesInWindow: 4,
    windowMs: 10 * 60_000,
    state: { lastReplyAt: 0, replyTimes: [] },
    random: () => 1,
    ...overrides
  };
}

test('decideGroupReply 永远不理自己的消息和纯图片消息', () => {
  assert.deepEqual(decideGroupReply(facts({ userId: SELF_ID }), options()), { reply: false, reason: 'self' });
  assert.deepEqual(decideGroupReply(facts({ text: '  ' }), options()), { reply: false, reason: 'empty' });
});

test('decideGroupReply 被 @ 必回且无视冷却与条数上限', () => {
  const now = 1_000_000;
  const busy = options({
    now,
    maxRepliesInWindow: 1,
    state: { lastReplyAt: now - 1_000, replyTimes: [now - 1_000] }
  });

  assert.deepEqual(decideGroupReply(facts({ atMe: true, text: '胡桃在吗' }), busy), {
    reply: true,
    trigger: 'at'
  });

  // 关掉「@ 必回」之后，被 @ 也会被条数限制拦住。
  assert.deepEqual(decideGroupReply(facts({ atMe: true }), { ...busy, replyToAt: false }), {
    reply: false,
    reason: 'rate-limited'
  });
});

test('decideGroupReply 叫名字按概率决定，命中率跟随概率', () => {
  const reply = decideGroupReply(facts({ mentionsName: true }), options({ random: () => 0.5 }));
  assert.deepEqual(reply, { reply: true, trigger: 'name' });

  const skip = decideGroupReply(facts({ mentionsName: true }), options({ random: () => 0.9 }));
  assert.deepEqual(skip, { reply: false, reason: 'random' });
});

test('decideGroupReply 普通聊天受冷却与插话概率约束', () => {
  const now = 1_000_000;
  const cooling = options({ now, state: { lastReplyAt: now - 30_000, replyTimes: [] } });
  assert.deepEqual(decideGroupReply(facts(), cooling), { reply: false, reason: 'cooling' });

  const warm = options({ now, random: () => 0.01 });
  assert.deepEqual(decideGroupReply(facts(), warm), { reply: true, trigger: 'interject' });

  const unlucky = options({ now, random: () => 0.9 });
  assert.deepEqual(decideGroupReply(facts(), unlucky), { reply: false, reason: 'random' });
});

test('pruneReplyTimes 只保留窗口内的记录', () => {
  const now = 1_000_000;
  const window = 60_000;
  assert.deepEqual(pruneReplyTimes([now - 90_000, now - 30_000, now], now, window), [now - 30_000, now]);
});
