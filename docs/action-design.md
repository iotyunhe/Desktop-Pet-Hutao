# 胡桃桌宠 · 新动作设计方案

> 2026-10-27 更新：12 张动作立绘已经生成并接入桌宠，实机预览见
> [docs/screenshots/new-actions-preview.png](screenshots/new-actions-preview.png)。
> 本文档保留原始设计、提示词与接入规格，方便后续继续扩展动作。

## 设计原则

1. **贴人设**：胡桃是往生堂第七十七代堂主，古灵精怪、爱押韵、有点小腹黑，动作要有「堂主感」而不是普通萌妹。
2. **不打断**：新动作只在空闲、漫步、点击、升级等时机出现，不抢用户正在看的窗口/面板。
3. **与现有状态互补**：现有 `idle / happy / curious / sleepy / pat / eat / gift / proud / desk-read / desk-write / desk-tea / walking-left / walking-right` 不重复。
4. **立绘只画角色，动效交给 CSS**：飘带、鬼火、Zzz、灯笼光、纸符飘动都用 CSS 伪元素/动画叠加，避免把特效烘焙进 PNG。
5. **一套动作一个 PNG**：不强制做序列帧；单张立绘 + CSS 变换就能有呼吸、摇晃、漂浮、旋转等效果。

## 统一美术规范

| 项 | 规范 |
| --- | --- |
| 风格 | Q 版 2D anime game sprite，赛璐璐上色，干净粗描边 |
| 构图 | 全身，正面或 3/4 侧面，居中，脚底贴近画布底部 |
| 尺寸 | 1024 × 1024，角色按脚底 baseline 对齐 |
| 背景 | 纯 `#00ff00` 绿幕，角色身上不要出现同色绿 |
| 阴影 | 不画地面投影（桌宠用 CSS `drop-shadow`） |
| 光效 | 鬼火、灯笼光、纸符光晕都不要烘焙，留给 CSS |
| 禁止 | 文字、logo、水印、边框、多角色、复杂场景、可辨认的官方 logo |
| 一致性 | 帽子、双马尾、梅花瞳、红褐外套、深色短裤/靴子必须与 `hutao-chibi.png` 一致 |

### 通用提示词模板（英文）

```text
Q-version 2D anime game sprite of Hu Tao from Genshin Impact (fan art), chibi proportions,
full body, [POSE], [EXPRESSION], [PROP], wearing her signature dark hat with plum blossom ornament,
twin tails, red-brown coat, cel shading, clean thick outlines, warm soft rim light,
centered composition, feet near the bottom edge, solid pure green background #00ff00,
no ground shadow, no text, no watermark, no logo, 1254x1254
```

### 通用负面提示词

```text
realistic, 3D render, semi-realistic, extra limbs, extra fingers, cropped body, out of frame,
text, watermark, logo, signature, scenery, gradient background, ground shadow, multiple characters,
blurry, low quality, jpeg artifacts, green clothing, off-model face
```

> 建议用现有 `hutao-chibi.png` 做角色参考图（image-to-image / character reference），
> 重绘幅度 0.45–0.6，固定 seed，一次只生成一个动作，方便保持同一张脸。

---

## 动作方案

### 1. 撑伞漫步 · `umbrella-stroll`

- **优先级**：P0
- **触发**：自由漫步时 25% 概率替换普通走路；或傍晚 17:00–19:00 首次漫步。
- **画面**：侧身向前走，单手撑一把红纸油伞，伞面略微前倾；另一只手自然摆起，外套下摆和双马尾向后飘。
- **表情**：嘴角上扬，眼神看前方。
- **动画**：`toddle` 步态 + 伞面 `rotate(-3deg → 3deg)` 慢摆；伞下加一层 CSS 暖色光晕。
- **台词**：「日头正好，撑伞巡街咯。」「这伞可是往生堂的门面。」
- **资源名**：`hutao-umbrella-walk-left.png` / `hutao-umbrella-walk-right.png`
- **提示词补充**：`walking side view holding a red paper umbrella, umbrella tilted forward, coat and twin tails flowing back, cheerful`

### 2. 放灯许愿 · `lantern-wish`

- **优先级**：P0
- **触发**：20:00–22:30 之间空闲；或送出 `lantern` 礼物后。
- **画面**：双手托起一盏小纸灯，微微仰头，灯在指尖上方；脚下没有影子。
- **表情**：少见地安静、温柔，眼睛映着灯光。
- **动画**：灯体 CSS 上下浮动 + 暖光呼吸；角色轻微抬头。
- **台词**：「灯放上去，愿望就飘到该去的地方啦。」「别急，堂主替你看着呢。」
- **资源名**：`hutao-lantern-wish.png`
- **提示词补充**：`holding a small glowing paper lantern with both hands, looking up gently, serene smile, no baked glow`

### 3. 画符 · `talisman`

- **优先级**：P0
- **触发**：空闲随机（低概率）；点击「好奇」状态后有 15% 概率接一段画符。
- **画面**：站立，一手持毛笔，一手拈一张黄纸符；纸符边角翘起，身体略微侧倾。
- **表情**：专注，舌尖微吐（俏皮）。
- **动画**：持笔手小幅画圈；纸符用 CSS 飘动 + 轻微旋转。
- **台词**：「这张符保你今晚不加班。」「符纸一笔，晦气退散！」
- **资源名**：`hutao-talisman.png`
- **提示词补充**：`standing, holding a calligraphy brush in one hand and a yellow paper talisman in the other, focused playful expression`

### 4. 抱膝打盹 · `nap`

- **优先级**：P1
- **触发**：睡觉状态随机二选一（与现有趴桌睡交替）。
- **画面**：坐在地上抱膝，头歪靠在膝盖上，帽子微微歪斜，双马尾垂到身侧。
- **表情**：闭眼，嘴巴小小张开。
- **动画**：慢呼吸缩放 + 三个 Zzz 用 CSS 上浮淡出。
- **台词**：「Zzz……桌面先交给你……」「就眯一小会儿……」
- **资源名**：`hutao-nap.png`
- **提示词补充**：`sitting hugging knees, head resting on knees, eyes closed, hat slightly tilted, sleeping`

### 5. 炸毛护发型 · `flustered-pat`

- **优先级**：P1
- **触发**：10 秒内连续摸头 3 次，替换第 3 次的普通 `pat`。
- **画面**：双手按在帽子上，帽子被按歪，双马尾炸开一点；脸颊泛红。
- **表情**：又羞又急，眼角带一点泪光。
- **动画**：快速左右抖动 2 次，然后恢复。
- **台词**：「发型！本堂主的发型！」「再摸就……就记账了啊！」
- **资源名**：`hutao-flustered.png`
- **提示词补充**：`both hands pressing her hat, hat tilted, twin tails slightly frizzed, blushing flustered expression, comic shake`

### 6. 递茶 · `offer-tea`

- **优先级**：P1
- **触发**：用户连续活跃 45 分钟后的空闲提醒；或每日首次互动。
- **画面**：双手把茶杯递向前方，身体微微前倾，茶面冒一缕热气（热气用 CSS）。
- **表情**：温柔但装作不耐烦。
- **动画**：手臂前伸，茶杯轻微上下；点击茶杯可触发现有「茶」养成互动。
- **台词**：「歇会儿，茶要凉了。」「本堂主亲自端的，敢不喝？」
- **资源名**：`hutao-offer-tea.png`
- **提示词补充**：`holding a teacup forward with both hands, leaning slightly toward viewer, gentle impatient smile`

### 7. 扮鬼吓人 · `boo`

- **优先级**：P0（最有胡桃味）
- **触发**：夜间（20:00 后）空闲随机、低概率；或点击胡桃时 8% 概率。
- **画面**：突然前倾，双手举在脸侧做鬼爪状，身后飘两团小幽灵火。
- **表情**：先做夸张鬼脸，下一帧切回偷笑（用两张 PNG 或一张 + CSS 抖动）。
- **动画**：0.2s 内放大 1.08 倍 + 左右抖动；鬼火用 CSS 漂浮。
- **台词**：「哇——！……噗，被本堂主吓到了吧？」「往生堂业务，了解一下？」
- **资源名**：`hutao-boo.png`（鬼脸）+ `hutao-boo-grin.png`（偷笑，可选）
- **提示词补充**：`leaning forward with hands raised like a playful ghost, exaggerated spooky face, tiny ghost flames behind, comedic`

### 8. 转圈庆祝 · `twirl`

- **优先级**：P1
- **触发**：养成升级 / 解锁新互动 / 收到「喜欢这类」反馈时。
- **画面**：单脚点地旋转，外套和双马尾呈放射状飞起，双手展开。
- **表情**：大笑，眼睛弯成月牙。
- **动画**：CSS `rotate(-8deg → 8deg)` 快速摇摆 + 彩纸屑（伪元素）。
- **台词**：「升级啦！转个圈庆祝一下！」「搭档，本堂主今天心情很好！」
- **资源名**：`hutao-twirl.png`
- **提示词补充**：`spinning on one foot, coat and twin tails flaring outward, arms open, joyful laughing expression, dynamic`

### 9. 拨算盘 · `abacus`

- **优先级**：P2
- **触发**：领取每日补给 / 连续签到后。
- **画面**：坐在小桌前，一手拨算盘，一手执笔；桌角放一本账册。
- **表情**：认真到有点小得意。
- **动画**：拨珠手小幅移动 + 算盘轻微晃动；纸页用 CSS 翻动。
- **台词**：「一笔一笔，往生堂的账可不能乱。」「今日收支，堂主亲自过目。」
- **资源名**：`hutao-abacus.png`
- **提示词补充**：`sitting at a small desk with an abacus, one hand on beads, one hand holding a brush, focused smug expression`

### 10. 伸懒腰 · `stretch`

- **优先级**：P2
- **触发**：从睡觉状态被唤醒时，先伸懒腰再切 `curious`。
- **画面**：双手举过头顶伸懒腰，身体拉长，帽子歪到一边，双马尾翘起。
- **表情**：闭眼、张嘴打哈欠。
- **动画**：整体 `scaleY(1.06)` 再回弹，配一个小哈欠气泡。
- **台词**：「唔——睡饱了，开工！」「哈——欠……本堂主满血复活。」
- **资源名**：`hutao-stretch.png`
- **提示词补充**：`stretching both arms overhead, body elongated, hat askew, eyes closed mid-yawn, sleepy cute`

---

## 排期建议

| 批次 | 动作 | 理由 |
| --- | --- | --- |
| 第一批 | 撑伞漫步、放灯许愿、扮鬼吓人 | 差异最大、最有胡桃味，能立刻让桌宠「活」起来 |
| 第二批 | 炸毛护发型、递茶、转圈庆祝 | 强化互动反馈，成本低（单张 + CSS） |
| 第三批 | 画符、抱膝打盹、拨算盘、伸懒腰 | 补充氛围与日常细节 |

## 代码接入（已完成）

1. `PetMood` 已增加 `umbrella-walk-left / umbrella-walk-right / lantern-wish / talisman / nap / flustered-pat / offer-tea / boo / boo-grin / twirl / abacus / stretch`。
2. `sprites.ts` 已接入 12 张 PNG；`styles/pet.css` 已为每个 mood 写动画。
3. 触发逻辑：`modules/roam.ts`（漫步变体、睡觉变体、递茶计时器、空闲特殊动作）、`modules/gestures.ts`（动作播放）、`modules/action-rules.ts`（纯规则）、`modules/interactions.ts`（点击/夜间扮鬼/睡醒伸懒腰）、`modules/care.ts`（连摸炸毛、小灯、升级转圈、每日算盘）、`modules/bilibili.ts`（喜欢转圈）。
4. 台词池统一在 `modules/lines.ts`。
5. 已通过 `npm run typecheck`、`npm test`（44 项）、`npm run build`，并用 `node scripts/run-smoke.cjs --capture --capture-mood=<mood>` 逐个截图检查。

## 素材验收清单

- [x] RGBA PNG，四角 alpha = 0
- [x] 1024 × 1024，脚底 baseline 对齐
- [x] 绿边已清理（despill + 缩小检查）
- [x] 右下角生成器水印已去除
- [x] 无文字、无场景
- [x] 帽子/发型/服装与 `hutao-chibi.png` 一致
- [x] 文件名符合上表，放入 `src/renderer/assets/pet/`
- [x] 在 75% 缩放下，头部和道具不被窗口裁切

## 实现状态

| 动作 | 素材 | 触发 |
| --- | --- | --- |
| 撑伞漫步 | `hutao-umbrella-walk-left/right.png` | 漫步时 25% 概率 |
| 放灯许愿 | `hutao-lantern-wish.png` | 傍晚空闲随机 / 送小灯 |
| 画符 | `hutao-talisman.png` | 空闲随机 |
| 抱膝打盹 | `hutao-nap.png` | 睡觉时 45% 概率 |
| 炸毛护发型 | `hutao-flustered.png` | 10 秒内连摸 3 次 |
| 递茶 | `hutao-offer-tea.png` | 连续使用 45 分钟后 |
| 扮鬼吓人 | `hutao-boo.png` / `hutao-boo-grin.png` | 夜间空闲 / 夜间点击 8% |
| 转圈庆祝 | `hutao-twirl.png` | 升级解锁 / B 站点赞 |
| 拨算盘 | `hutao-abacus.png` | 领取每日补给后 |
| 伸懒腰 | `hutao-stretch.png` | 睡觉被唤醒时 |

## 重新生成素材的流程

1. 把新的绿幕图放进 `docs/hutao-action-design/`，按 `NN-动作名.png` 命名。
2. 在 `scripts/process-action-sprites.py` 的 `MAPPING` 中补上编号和输出名。
3. 运行 `python scripts/process-action-sprites.py`，自动抠图、去水印、对齐 baseline，并输出到 `src/renderer/assets/pet/`。
4. 在 `sprites.ts`、`lines.ts`、`gestures.ts` 补映射与触发，再跑测试与冒烟截图。
