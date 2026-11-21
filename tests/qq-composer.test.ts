import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_QQ_REPLY_TEXT } from '../src/shared/qq';
import {
  estimateTypingDelayMs,
  parseGroupMessage,
  sanitizeGroupReply,
  splitIntoBubbles
} from '../src/main/services/qq/message-composer';

const SELF_ID = 10001;
const BOT_NAMES = ['胡桃'];

test('parseGroupMessage 从消息数组里读出文本、@ 与图片数', () => {
  const parsed = parseGroupMessage(
    [
      { type: 'at', data: { qq: String(SELF_ID) } },
      { type: 'text', data: { text: ' 胡桃 快看这个 ' } },
      { type: 'image', data: { file: 'abc.png' } }
    ],
    SELF_ID,
    BOT_NAMES
  );

  assert.equal(parsed.atMe, true);
  assert.equal(parsed.imageCount, 1);
  assert.equal(parsed.mentionsName, true);
  assert.equal(parsed.meaningful, true);
  assert.match(parsed.text, /@胡桃/);
  assert.match(parsed.text, /\[图片\]/);
});

test('parseGroupMessage 兼容 CQ 码字符串并过滤纯表情', () => {
  const parsed = parseGroupMessage('[CQ:at,qq=all] 大家晚上好', SELF_ID, BOT_NAMES);
  assert.equal(parsed.atAll, true);
  assert.equal(parsed.atMe, false);
  assert.equal(parsed.meaningful, true);

  const onlyFace = parseGroupMessage([{ type: 'face', data: { id: '1' } }], SELF_ID, BOT_NAMES);
  assert.equal(onlyFace.meaningful, false);
});

test('sanitizeGroupReply 去掉链接、Markdown 与注明，并限制长度', () => {
  assert.equal(sanitizeGroupReply('**好耶** 详见 https://b23.tv/abc'), '好耶 详见');

  const long = sanitizeGroupReply('哈'.repeat(MAX_QQ_REPLY_TEXT + 40));
  assert.ok(long.length <= MAX_QQ_REPLY_TEXT);
  assert.match(long, /…$/);
});

test('splitIntoBubbles 把长句拆成不超过 3 条，短句保持一条', () => {
  assert.deepEqual(splitIntoBubbles('嗯嗯', () => 0), ['嗯嗯']);

  const bubbles = splitIntoBubbles(
    `${'今天的热门视频好好笑啊。'.repeat(8)}你也去看看嘛！`,
    () => 0.5
  );
  assert.ok(bubbles.length >= 2 && bubbles.length <= 3);
  assert.ok(bubbles.every((bubble) => bubble.length > 0));
});

test('estimateTypingDelayMs 落在 0.9-4.6 秒之间', () => {
  assert.equal(estimateTypingDelayMs('嗯', () => 0), 900);
  assert.equal(estimateTypingDelayMs('嗯', () => 1), 995);

  const longText = '这'.repeat(200);
  assert.equal(estimateTypingDelayMs(longText, () => 1), 4600);
});
