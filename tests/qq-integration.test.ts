import assert from 'node:assert/strict';
import { test } from 'node:test';
import WebSocket from 'ws';
import type { AiService } from '../src/main/services/ai/ai-service';
import { QqService } from '../src/main/services/qq/qq-service';
import type { QqSettingsStore } from '../src/main/storage/qq-store';
import { noopLogger } from '../src/main/util/logger';
import { DEFAULT_QQ_SETTINGS, type QqSettings } from '../src/shared/qq';

const PORT = 17999;
const TOKEN = 'test-token';
const SELF_ID = 10001;
const GROUP_ID = 123456;
const OTHER_GROUP_ID = 999999;

interface SentMessage {
  groupId: number;
  text: string;
}

/**
 * 用一个「假协议端」把整条链路跑起来：
 * 真 WebSocket 连上 QqService 起的网关 → 发群消息事件 → 断言胡桃通过 send_group_msg 回话。
 * 模型层换成假实现，不访问网络。
 */
function createSettings(overrides: Partial<QqSettings> = {}): QqSettingsStore {
  let current: QqSettings = {
    ...DEFAULT_QQ_SETTINGS,
    enabled: true,
    wsPort: PORT,
    accessToken: TOKEN,
    selfQq: String(SELF_ID),
    allowedGroups: [GROUP_ID],
    quietHoursEnabled: false,
    interjectChance: 0,
    nameReplyChance: 100,
    ...overrides
  };

  return {
    get: () => current,
    update: (patch: Partial<QqSettings>) => {
      current = { ...current, ...patch };
      return current;
    }
  } as unknown as QqSettingsStore;
}

function createAi(replies: string[] = ['好耶，本堂主来啦']): AiService {
  let index = 0;
  return {
    generate: async () => {
      const text = replies[Math.min(index, replies.length - 1)];
      index += 1;
      return text;
    },
    getStatus: () => ({ settings: { persona: '' } })
  } as unknown as AiService;
}

function waitFor(predicate: () => boolean, timeoutMs = 6000, stepMs = 40): Promise<void> {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tick = (): void => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error('等待超时'));
        return;
      }
      setTimeout(tick, stepMs);
    };
    tick();
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface FakeOneBot {
  socket: WebSocket;
  sent: SentMessage[];
  close: () => Promise<void>;
}

/** 模拟 SnowLuma：连上网关，响应 API 调用，记录 send_group_msg。 */
async function connectFakeOneBot(url: string): Promise<FakeOneBot> {
  const socket = new WebSocket(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const sent: SentMessage[] = [];

  socket.on('message', (raw) => {
    const payload = JSON.parse(String(raw)) as {
      action?: string;
      params?: { group_id?: number; message?: Array<{ type: string; data: { text?: string } }> };
      echo?: string;
    };
    if (!payload.action) {
      return;
    }

    if (payload.action === 'send_group_msg') {
      const text = (payload.params?.message ?? [])
        .map((segment) => (segment.type === 'text' ? String(segment.data.text ?? '') : ''))
        .join('');
      sent.push({ groupId: Number(payload.params?.group_id ?? 0), text });
    }

    socket.send(
      JSON.stringify({
        status: 'ok',
        retcode: 0,
        data:
          payload.action === 'get_group_list'
            ? [{ group_id: GROUP_ID, group_name: '测试群', member_count: 3 }]
            : { user_id: SELF_ID, nickname: '胡桃' },
        echo: payload.echo
      })
    );
  });

  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });

  return {
    socket,
    sent,
    close: async () => {
      socket.removeAllListeners();
      socket.close();
      await delay(60);
    }
  };
}

function groupMessageEvent(options: {
  groupId?: number;
  userId?: number;
  text: string;
  atMe?: boolean;
}): string {
  const segments = options.atMe
    ? [
        { type: 'at', data: { qq: String(SELF_ID) } },
        { type: 'text', data: { text: ` ${options.text}` } }
      ]
    : [{ type: 'text', data: { text: options.text } }];

  return JSON.stringify({
    post_type: 'message',
    message_type: 'group',
    self_id: SELF_ID,
    group_id: options.groupId ?? GROUP_ID,
    user_id: options.userId ?? 20002,
    sender: { user_id: options.userId ?? 20002, nickname: '小明' },
    message: segments,
    raw_message: segments.map((segment) => (segment.type === 'text' ? segment.data.text : '')).join('')
  });
}

test('QQ 链路：协议端连上后，@ 胡桃会回一句话并发回群里', async (t) => {
  const service = new QqService({ settings: createSettings(), ai: createAi(), logger: noopLogger });
  t.after(async () => {
    await service.dispose();
  });

  const status = await service.connect();
  assert.equal(status.listenUrl, `ws://127.0.0.1:${PORT}/ws`);

  const bot = await connectFakeOneBot(`ws://127.0.0.1:${PORT}/ws`);
  t.after(async () => {
    await bot.close();
  });

  await waitFor(() => service.getStatus().state === 'online');
  // 上线后主进程会异步调 get_login_info 补昵称，这里等它回来。
  await waitFor(() => service.getStatus().botNickname === '胡桃');

  bot.socket.send(groupMessageEvent({ text: '胡桃在吗', atMe: true }));
  await waitFor(() => bot.sent.length > 0);

  assert.equal(bot.sent[0].groupId, GROUP_ID);
  assert.match(bot.sent[0].text, /好耶/);
  assert.equal(service.getStatus().todayReplies, 1);
});

test('QQ 链路：@ 回复不受「10 分钟上限」限制', async (t) => {
  const service = new QqService({
    settings: createSettings({ maxRepliesPer10Minutes: 2 }),
    ai: createAi(['第一句', '第二句', '第三句', '第四句', '第五句']),
    logger: noopLogger
  });
  t.after(async () => {
    await service.dispose();
  });

  await service.connect();
  const bot = await connectFakeOneBot(`ws://127.0.0.1:${PORT}/ws`);
  t.after(async () => {
    await bot.close();
  });
  await waitFor(() => service.getStatus().state === 'online');

  for (let index = 0; index < 4; index += 1) {
    bot.socket.send(groupMessageEvent({ text: `找我第${index}次`, atMe: true }));
    await waitFor(() => bot.sent.length === index + 1);
  }

  assert.equal(bot.sent.length, 4);
});

test('QQ 链路：群不在白名单 / 自己发的消息都不回', async (t) => {
  const service = new QqService({ settings: createSettings(), ai: createAi(), logger: noopLogger });
  t.after(async () => {
    await service.dispose();
  });

  await service.connect();
  const bot = await connectFakeOneBot(`ws://127.0.0.1:${PORT}/ws`);
  t.after(async () => {
    await bot.close();
  });
  await waitFor(() => service.getStatus().state === 'online');

  bot.socket.send(groupMessageEvent({ groupId: OTHER_GROUP_ID, text: '胡桃在吗', atMe: true }));
  bot.socket.send(groupMessageEvent({ userId: SELF_ID, text: '胡桃在吗', atMe: true }));
  await delay(700);

  assert.equal(bot.sent.length, 0);
});
