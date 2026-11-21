# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/)。

## [0.7.0] - 2026-11-21

### Added

- **克隆音色**：语音引擎新增第三种 `clone`，把一段 3~10 秒的参考音频交给本机 [GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS) 服务，让她用那个声音念台词。桌宠只发 HTTP 请求（默认 `http://127.0.0.1:9880`），不内嵌模型、不增加安装包体积；服务没开时语音静默失败，气泡照常。
- 面板「AI → 偏好设置」新增：克隆服务地址 + 「检查」、参考音频路径、参考台词、参考台词语言、朗读语言。
- `CloneTtsClient`（`src/main/services/ai/clone-tts.ts`）：`POST /tts`（`text_split_method=cut5`、`repetition_penalty=1.35`、`media_type=wav`），90 秒超时，错误文案区分「服务没开 / 返回空音频 / 没填参考音频」。
- `npm run smoke:ai` 在克隆引擎下会额外检查「服务在线」并真的合成一段音频。
- 新增文档 `docs/voice-clone.md`：从零装 GPT-SoVITS（镜像源、torch cu121、依赖踩坑表）、准备参考音频、转写、启动服务、面板配置、性能与排障。

### Changed

- `AiSettings` 新增 `ttsApiUrl` / `ttsRefAudio` / `ttsPromptText` / `ttsPromptLang` / `ttsTextLang`，`TtsEngine` 扩展为 `system | off | clone`。
- 试音与自动朗读统一走 `speakWithSettings`，两种引擎共用同一套失败降级逻辑；失败原因写进 `lastError` 与日志。

## [0.6.0] - 2026-11-21

### Added

- **本机权限板块**：面板新增第 5 个标签「权限」。五种能力全部默认关闭，一项一项打开：读白名单里的文本文件、列白名单目录、看主屏截图、打开登记过的程序/文件/网址、执行命令（**每次都要点「允许」**）。
- **三层闸门**：策略开关决定工具是否出现在模型侧（不是「被拒绝」，而是模型看不见）；路径闸门先 `realpath` 再比对白名单，拦住 `..` 跳转、符号链接与 `C:\Windows` / `Program Files` / `AppData` 等系统目录；审批队列（2 分钟过期）+ 每小时操作上限（默认 30）。
- **审计**：每次操作写入 `userData/access-audit.jsonl`，面板显示最近几条，可在工作台里清空。
- **QQ 管理员**：`adminQqs` 默认空（谁都不能指挥她动电脑）。群里只有「管理员 @ 她」那一句会挂工具，插话与群友的 @ 只聊天；管理员私聊可直接下指令，她做完用一句话回结果。
- **胡桃工作台**：桌宠内置只监听 `127.0.0.1` 的小 HTTP 服务（默认端口 4649，随机 token），页面在 `tools/hutao-workbench/index.html`，打包后位于 `resources/workbench/index.html`。托盘「胡桃工作台」、权限面板按钮、`胡桃桌宠.exe --open-workbench` 三种打开方式，`scripts/create-workbench-shortcut.ps1` 可在桌面建快捷方式。
- **工具循环**：`ChatClient.chatWithTools` + `runToolLoop`（最多 3 轮），支持 OpenAI 兼容的 `tools` / `tool_calls`，截图会以 `image_url` 回灌给支持视觉的模型。
- 新增文档 `docs/access-control.md`、`docs/workbench.md`；新增单测 `access-policy` / `access-service` / `tool-loop`；冒烟新增权限与工作台探针（共 44 项检查）。

### Changed

- 标签栏改为自适应列数，加第 5 个标签也不会折行。
- `normalizeLaunchEntries` 支持省略 `kind`（按 target 自动推断 url / app / file），手写配置更省事。

### Security

- 默认策略：所有本机能力关闭、管理员列表为空、工作台只监听回环地址且必须有 token。
- 命令只能在审批通过后执行；不存在写文件/删文件的直接接口。

## [0.5.1] - 2026-11-21

### Fixed

- 从 MiniMax 版本升级上来时，接口地址会自动换到默认网关，但旧的模型名（`MiniMax-M2.7`）被留了下来，导致每次请求都 400。现在「模型名像 MiniMax、而接口不是 MiniMax」时会自动换成默认模型；重复启动也能自愈，已经迁移过的存档同样修好。
- 「测试连接」在推理模型上会因为 `max_tokens` 被思考过程吃光而只拿到空回复，现在给足预算（512）并返回真实耗时与原话。

### Added

- `npm run smoke:ai`（底层是 `--ai-smoke`）：用真实存档里的 Key 打一次模型接口、列一次本机音色，直接告诉你「配上没有」。不重定向 userData，也不占用单实例锁。

## [0.5.0] - 2026-11-21

### Added

- **QQ 群聊板块**：面板新增第 4 个标签「QQ」。桌宠内置 OneBot 11 反向 WebSocket 服务（默认 `ws://127.0.0.1:6700/ws`），配合 SnowLuma / NapCat 让胡桃挂在小号上到指定群里说话。
  - 说话策略：@ 必回；叫名字按概率回（默认 70%）；普通聊天按概率插话（默认 8%，同群冷却 4 分钟）；10 分钟最多 4 条；安静时段默认 01:00–08:00。全部可在面板里调。
  - 像人的细节：按字数算打字延迟、长回复拆 1–3 条、清洗链接/@全体/Markdown/思考过程、每群最近 16 条上下文且 10 分钟过期、最近 12 条自发言可回看。
  - 群白名单（没加的群一律不发言）、token 校验、心跳、自动重连、模型失败兜底台词。
- 群聊相关纯函数：`reply-decider`（该不该说）、`message-composer`（解析/清洗/拆泡/延迟/prompt），共 10 项单测。
- 端到端集成测试：真 WebSocket 冒充协议端连上网关，验证「@ 必回」「@ 不受频率上限限制」「白名单外与自己发的消息都不回」，共 69 项测试全绿。
- `scripts/qq-setup.ps1`：自动把 `name=hutao` 的反向 WS 配置写进 SnowLuma（保留其它配置、写前备份、生成 token）。
- `docs/qq-setup.md`：接入步骤、规则说明、排障表。
- 冒烟测试新增 3 条 QQ 检查：网关监听、OneBot API 调用回包、群消息事件送达。

### Changed

- **大模型换成可自由配置的 OpenAI 兼容接口**，不再绑定 MiniMax：
  - 默认 `https://opencode.ai/inference/go/v1` + `deepseek-v4.1-flash`；面板可改接口地址与模型名，支持「拉取模型」列表和「测试连接」（返回真实耗时与原话）。
  - 对 `opencode.ai` 自动附加 `x-opencode-session` / `x-opencode-client` 请求头（该网关的路由要求）。
- **语音改用 Windows 系统合成**（System.Speech），不再依赖厂商 TTS：默认音色 `Microsoft Huihui Desktop`，可「读取音色」列出本机音色，也可设成关闭。
- API Key 存储从 `minimax-api-key.bin` 改为 `llm-api-key.bin`，并支持环境变量 `HUTAO_API_KEY` / `OPENCODE_API_KEY` / `DEEPSEEK_API_KEY`（环境变量不落盘）；旧文件会被自动读取并迁移。
- 互动面板标签栏自适应列数，四个标签不会再折行。

### Removed

- `minimax-client.ts`、MiniMax TTS 与 `ttsModel`/`voiceId` 配置项（读取旧配置时自动迁移为 `ttsEngine: 'system'` + 默认音色）。

### Fixed

- `scripts/run-smoke.cjs` 之前只认 `--capture <path>` 的写法，`--capture=<path>` 会被静默忽略导致截图命令不产出文件。

## [0.4.1] - 2026-10-28

### Fixed

- 面板/分享卡关闭后窗口宽度没有归位，留下「一大块透明区域 + 菜单按钮在很远处」的问题。
- 渲染层与主进程面板状态失同步时，渲染层每秒检查并在连续两次异常后强制归位；长按/拖拽时也会再次请求主进程收起面板。
- 窗口 resize 增加尺寸看门狗，非面板状态下会被拉回桌宠尺寸。

### Added

- 冒烟测试覆盖面板展开/关闭、分享卡打开/关闭、长按关闭面板，以及「主进程展开但渲染层认为关闭」的失同步自愈。

## [0.4.0] - 2026-10-28

### Added

- 互动面板改为「互动 / B站 / AI」三个标签页，操作与配置不再堆叠在一条长列表里。
- 开源项目文档：LICENSE、CONTRIBUTING、SECURITY、CHANGELOG、GitHub Actions CI。

### Fixed

- 长按桌宠时不再弹出/撑大气泡：长按会收起当前气泡，拖拽期间禁止新气泡，并给窗口与气泡加上尺寸硬上限。
- 面板侧栏改为固定标签头 + 独立滚动内容区，切换标签时不会带着上一页的滚动位置。

## [0.3.0] - 2026-10-27

### Added

- 12 张新动作立绘：撑伞漫步（左/右）、放灯许愿、画符、抱膝打盹、炸毛护发型、递茶、扮鬼吓人（鬼脸/偷笑）、转圈庆祝、拨算盘、伸懒腰。
- 新动作的 CSS 动画、气泡台词与触发规则。
- `scripts/process-action-sprites.py`：绿幕抠图、去水印、baseline 对齐与预览图生成。

## [0.2.0] - 2026-10-27

### Added

- B 站漫游：定时抓取热门/排行/分区新稿，筛选后以分享卡推荐；支持喜欢/不感兴趣反馈、安静时段、每日上限。
- MiniMax AI 对话、桌面观察、TTS 与 B 站推荐语。

### Changed

- 重构主进程与渲染层为模块化结构：
  - `shared` 契约层、`JsonStore` 原子持久化、IPC 事件推送；
  - 窗口管理、托盘、养成、AI、B 站服务拆分；
  - 面板、气泡、漫游、拖拽、动作模块拆分。
- 新增单实例锁、结构化日志、应用/托盘图标、冒烟测试与 44 个单元测试。

## [0.1.0] - 2026-05-10

### Added

- 初始版本：透明置顶窗口、拖拽、漫步、点击反应、托盘菜单、设置持久化、养成系统。
