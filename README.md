# 胡桃桌宠 · Hu Tao Desktop Pet

[![CI](https://github.com/iotyunhe/Desktop-Pet-Hutao/actions/workflows/ci.yml/badge.svg)](https://github.com/iotyunhe/Desktop-Pet-Hutao/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64-3b82f6.svg)](#)
[![Electron](https://img.shields.io/badge/Electron-42-47848f.svg)](https://www.electronjs.org/)

一个 Windows 优先的 2D Electron 桌宠：透明置顶、拖拽漫步、点击反应、温柔养成、可自由换模型（默认 OpenCode + deepseek-v4.1-flash）的 AI 对话、**自己定时去 B 站逛并分享内容**，以及 **挂在小号上到群里聊天** 的 QQ 板块。桌宠现有 25 个动作状态，其中 12 个是新增的「撑伞、放灯、扮鬼、画符、递茶」等形象。

> 这是本地运行的非商业 fan-art 项目，与 HoYoverse 无关。《原神》与胡桃角色版权归 HoYoverse 所有。

## 界面预览

互动面板有「互动 / B站 / AI / QQ / 权限」五个标签页，操作和配置不再堆在一条长列表里：

| 互动 | B站 | AI | QQ | 权限 |
| --- | --- | --- | --- | --- |
| ![互动面板](docs/screenshots/care-panel.png) | ![B站面板](docs/screenshots/bilibili-panel.png) | ![AI面板](docs/screenshots/ai-panel.png) | ![QQ面板](docs/screenshots/qq-panel.png) | ![权限面板](docs/screenshots/access-panel.png) |

B 站分享卡：

![B 站分享卡](docs/screenshots/share-card.png)

12 个新动作（全部在真实 Electron 窗口里逐个截图）：

![新动作预览](docs/screenshots/new-actions-preview.png)

## 快速开始

```powershell
git clone https://github.com/iotyunhe/Desktop-Pet-Hutao.git
cd Desktop-Pet-Hutao
npm install
npm run dev        # 开发模式
npm run dist       # 打包：安装版 exe + 便携版 exe
```

构建产物在 `release/`：

- `HuTao-Desktop-Pet-Setup-0.6.0-x64.exe`：NSIS 安装包。
- `HuTao-Desktop-Pet-0.6.0-portable.exe`：免安装便携版。
- `win-unpacked/胡桃桌宠.exe`：未压缩目录版，方便调试。

> 打包会写入应用图标与版本信息，electron-builder 首次需要下载 `winCodeSign`。如果它在无管理员权限的机器上解压失败，可用管理员权限运行一次，或把 `winCodeSign-2.6.0.7z` 解压到 `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0` 后重试（只需 Windows 部分，darwin 软链接报错可以忽略）。安装包没有代码签名，首次运行可能触发 SmartScreen，选择「仍要运行」即可。

## 功能

### 桌宠本体

- 透明无边框窗口，默认出现在主屏右下角，始终置顶。
- 左键拖拽移动并保存位置；单击触发开心/好奇反应；**长按只拖拽，不会弹气泡、不会把窗口撑大**。
- 75 秒无交互进入睡觉状态，点击唤醒。
- 自由漫步：每 30–54 秒随机小幅移动，左右使用独立步行动作，自动避开屏幕边界。
- 空白区域鼠标穿透，只有胡桃本体、菜单按钮和面板可交互。
- 托盘菜单：显示/隐藏、置顶、漫步、开机自启、缩放、重置位置、去 B 站逛一圈、B 站自动分享、退出。
- 设置持久化到 Electron `userData/settings.json`。

### 互动面板

- 五个标签页：**互动 / B站 / AI / QQ / 权限**，每个标签独立滚动，不再把养成操作和接口配置混在一起。
- 互动：亲密度/等级/心情/精力、摸头、休息、每日补给、茶点与礼物。
- B站：自动逛站开关、免打扰、AI 文案、去逛逛、打开 B 站、最近分享；偏好设置折叠在「偏好设置」里。
- AI：聊天、AI/观察/语音开关、API Key、测试连接、观察一下、试音；模型与接口配置折叠在「配置」里。
- QQ：开关与连接状态、端口/token/小号、群白名单、管理员 QQ、说话概率与频率、群聊人设。
- 权限：本机访问总开关与四个分开关、只读目录、打开白名单、命令审批队列、审计记录、打开工作台。
- 分享卡仍然独立展开，不会挤占面板。
- 面板/分享卡关闭、或渲染层与主进程失同步时，会自动把窗口收回桌宠尺寸，不会留下「宽窗口 + 远处菜单按钮」的残局。

### 温柔养成

- 亲密度、等级、心情、精力、背包、每日补给与等级解锁奖励。
- 摸头、喂食、送礼、休息；不互动不会掉亲密度，也没有惩罚。
- 养成档案保存在 `userData/profile.json`。

### AI 互动（可选）

胡桃可以聊天、看你在干什么、用语音回你一句话。模型走 **OpenAI 兼容的 `chat/completions` 接口**，不绑定任何一家厂商。

- **默认**：OpenCode（`https://opencode.ai/inference/go/v1`）+ `deepseek-v4.1-flash`，开箱即用。
- **换模型**：面板里改「接口地址 / 文本模型」即可，DeepSeek、OpenAI、Kimi、GLM、本地 Ollama、LM Studio 都行；点「拉取模型」可以直接从接口读出模型列表。
- **验证**：「测试连接」会真的发一次对话请求，显示模型、耗时和回的原话，不用等聊天时才发现配置错了。
- **语音**：默认用 Windows 自带语音合成（System.Speech，默认音色 `Microsoft Huihui Desktop`），点「读取音色」列出本机所有音色，不需要额外 API；不想用就把语音引擎设成「关闭」。
- **克隆音色**：想让她用某个具体的声音，可以把语音引擎切成「克隆音色（GPT-SoVITS）」，接一个本机的 GPT-SoVITS 服务（3~10 秒参考音频 + 对应台词即可）。服务常驻在本机，桌宠只发 HTTP 请求，不内嵌模型；服务没开时语音静默失败、气泡照常。完整安装步骤与踩坑清单见 [docs/voice-clone.md](docs/voice-clone.md)。
- **低频观察**：只看当前活动应用名与窗口标题，不截图、不 OCR。
- **Key 从哪来**：优先级为面板保存的 Key → 环境变量 `HUTAO_API_KEY` / `OPENCODE_API_KEY` / `DEEPSEEK_API_KEY`。面板保存的 Key 用 Electron `safeStorage` 加密存到 `userData/llm-api-key.bin`，不会进入仓库；环境变量的 Key 不落盘。
- 从 0.4.x 升级：旧的 `minimax-api-key.bin` 会被自动读取并迁移到新文件；本来就在用 MiniMax 的话，把接口地址填回 `https://api.minimaxi.com/v1` 即可。

### QQ 群聊（可选）

胡桃可以挂在一个小号上，在指定群里像人一样说话，而不是见谁都接话：

- **接入方式**：桌宠自带 OneBot 11 反向 WebSocket 服务（默认 `ws://127.0.0.1:6700/ws`），由协议端（SnowLuma / NapCat）把群消息推过来，胡桃的回话也走同一条连接。桌宠本身不登录 QQ。
- **什么时候说话**：@ 必回；消息里出现「胡桃」按概率回（默认 70%）；普通聊天按概率插一句（默认 8%，同群冷却 4 分钟）；10 分钟最多 4 条；安静时段（默认 01:00–08:00）谁叫都不应。这些数字都能在面板里改。
- **像人的细节**：回复前按字数算打字延迟（最长 4.6 秒），长回复拆成 1–3 条、条间再等一会儿；自动去掉链接、@全体、Markdown 和思考过程；每个群只保留最近 16 条上下文、10 分钟清空；最近说过的话列在面板里，方便回看。
- **安全阀**：默认不主动私聊、不发链接、不加好友；没加白名单的群一句话都不说；模型调用失败时回固定台词，不会在群里卡住或复读报错。
- **怎么装**：见 [docs/qq-setup.md](docs/qq-setup.md)，或跑 `scripts/qq-setup.ps1` 让它把反向 WS 配置写进 SnowLuma。
- **风险**：第三方协议端不是腾讯官方方案，违反 QQ 用户协议、**有封号风险，务必用小号**。

### 本机权限（可选，默认全关）

默认情况下她只会聊天，碰不到你的电脑。想让她帮点忙，再一项一项打开：

- **五种能力**：读文本文件、列目录、看屏幕截图、打开登记过的程序/文件/网址、执行命令（**每次都要你点「允许」**）。写文件/删文件没有对应工具，只能走审批命令。
- **三层闸门**：策略开关决定工具是否可见 → 路径闸门用 `realpath` 比对白名单（`..` 跳转和符号链接都拦，`C:\Windows`、`Program Files`、`AppData` 这类系统目录一律拒绝）→ 审批队列 + 每小时上限（默认 30 次）。
- **谁能让它动电脑**：面板里，或者 QQ 里的**管理员 QQ**；群里只有管理员 @ 她那一句才挂工具，插话和群友的 @ 都只聊天。
- **留痕**：每次操作写入 `userData/access-audit.jsonl`，面板与工作台都能看，随时可以一键关闭总开关收回全部能力。
- 细节见 [docs/access-control.md](docs/access-control.md)。

### 胡桃工作台（可选）

桌宠内置一个**只在本机**的小网页，用来集中看状态、批命令、配权限：

- 打开方式：托盘右键「胡桃工作台」、权限面板「打开工作台」，或 `胡桃桌宠.exe --open-workbench`；`scripts/create-workbench-shortcut.ps1` 可以在桌面建快捷方式。
- 服务只监听 `127.0.0.1`，默认端口 `4649`，带随机 token；没 token 的请求一律 401。
- 页面是纯静态单文件（`tools/hutao-workbench/index.html`），打包后位于安装目录 `resources/workbench/index.html`，改完刷新即可。
- 细节见 [docs/workbench.md](docs/workbench.md)。

### B 站漫游

胡桃会按你设置的节奏，自己「出门」去 B 站逛一圈，挑一条内容，然后回来给你分享：

1. **自动逛站**：默认每 75 分钟一次（15–360 分钟可调，带 ±25% 随机抖动），每天最多 8 条。
2. **手动逛站**：互动面板里点「去逛逛」，或托盘菜单「去 B 站逛一圈」。
3. **内容来源**：匿名调用 B 站公开接口——热门、排行榜、游戏/科技分区最新投稿，四个来源并行抓取后按 `bvid` 去重。
4. **内容筛选**：
   - 排除广告、带货、恰饭、恐怖、引战、网暴等关键词；
   - 默认只看 45 秒–20 分钟的视频（可在配置里放开到 60 分钟）；
   - 过滤低播放、看过、点踩过的稿件和 UP 主；
   - 按兴趣关键词、分区喜好、播放量、新鲜度打分，并在候选前列做偏置随机，避免每次都是同一条热门。
5. **分享卡片**：封面、标题、UP 主、时长、播放量、推荐理由，以及「去 B 站看看 / 复制链接 / 换一个 / 不感兴趣 / 喜欢这类」。
6. **不打扰**：
   - 安静时段（默认 00:30–07:30）不自动分享；
   - 你正在看面板时，只在气泡里提示并亮起小红点，不抢面板；
   - 点「不感兴趣」会记住这个稿件和 UP 主，后续推荐自动避开。
7. **AI 文案（可选）**：配置 MiniMax 后，胡桃会根据标题/分区/播放量现写一句推荐语；没配置或请求失败时自动回退到本地模板文案，功能不依赖 API Key。
8. **隐私边界**：不上传任何本地数据；请求只带 B 站公开接口必需的 User-Agent/Referer；封面由主进程下载为 data URL 后展示，渲染层不会直接访问外部图片。

### 新动作立绘

| 动作 | 触发 |
| --- | --- |
| 撑伞漫步（左/右） | 自由漫步时 25% 概率替换普通走路 |
| 放灯许愿 | 傍晚空闲随机；或送出「小灯」礼物后 |
| 画符 | 空闲随机（白天也有机会） |
| 抱膝打盹 | 睡觉时 45% 概率替代趴桌睡 |
| 炸毛护发型 | 10 秒内连续摸头 3 次 |
| 递茶 | 连续使用 45 分钟后；之后每 90 分钟一次 |
| 扮鬼吓人（鬼脸→偷笑） | 夜间空闲随机；夜间点击 8% 概率 |
| 转圈庆祝 | 升级/解锁新互动；B 站分享点「喜欢这类」 |
| 拨算盘 | 领取每日补给后 |
| 伸懒腰 | 从睡觉状态被点击唤醒时 |

素材处理脚本会做绿幕抠图、去水印、脚底 baseline 对齐和棋盘格预览：

```powershell
python scripts/process-action-sprites.py
```

## 项目结构

```
src/
  shared/                      # 主进程与渲染进程共享的契约（纯 TS，可单测）
    pet.ts                     # 窗口/缩放/面板类型与默认值
    care.ts                    # 养成类型、道具、奖励等级
    ai.ts                      # 大模型设置、状态、模型/音色列表类型
    qq.ts                      # QQ 板块设置、状态、群与回复日志类型
    access.ts                  # 本机权限策略、审计、待审批与工作台类型
    bilibili.ts                # B 站设置/分享类型 + 安静时段纯函数
    normalize.ts               # 所有持久化数据的归一化（脏数据收口）
    format.ts                  # 播放量/时长/截断格式化
    ipc.ts                     # IPC 通道常量 + 渲染层可见的 HuTaoPetApi
  main/
    index.ts                   # 启动编排、单实例、冒烟测试入口
    smoke.ts                   # 打包后窗口冒烟测试 + 长按/面板/QQ 网关探针
    smoke-access.ts            # 权限内核与工作台探针
    workbench/server.ts        # 工作台本机 HTTP 服务（token、状态、动作路由）
    ipc/register-ipc.ts        # 全部 IPC handler 与入参校验
    window/
      window-manager.ts        # 透明窗口、拖拽、漫步位移、缩放、面板几何与尺寸上限
      tray.ts                  # 托盘菜单
      assets.ts                # 开发/打包两种图标路径解析
    storage/
      json-store.ts            # 原子写 JSON（tmp + rename）持久化
      settings-store.ts        # settings.json
      profile-store.ts         # profile.json
      ai-store.ts              # ai-settings.json + safeStorage 加密的模型 Key
      qq-store.ts              # qq-settings.json
      access-store.ts          # access-settings.json（权限策略）
      bilibili-store.ts        # B 站设置与历史
      bilibili-history.ts      # 历史结构、归一化与容量限制
    services/
      care-service.ts          # 养成逻辑
      ai/
        chat-client.ts         # OpenAI 兼容 chat/completions（可注入 fetch 测试）
        system-tts.ts          # Windows 系统语音合成（System.Speech）
        clone-tts.ts           # GPT-SoVITS 克隆音色客户端（本机 HTTP）
        ai-service.ts          # 对话/观察/试音/模型列表/连通性测试/B 站推荐语
        desktop-observer.ts    # active-win 低频观察与去重
      qq/
        onebot-gateway.ts      # OneBot 11 反向 WS 服务端（token 校验、echo 匹配、心跳）
        reply-decider.ts       # 该不该说：@ / 名字 / 插话概率 / 冷却 / 频率（纯函数）
        message-composer.ts    # 消息解析、清洗、拆气泡、打字延迟、群聊 prompt（纯函数）
        qq-service.ts          # 群白名单、上下文、安静时段、管理员私聊、工具门控
      access/
        local-access-service.ts # 权限内核：策略、路径守卫、限流、审批、审计
        platform-access.ts     # 截图（desktopCapturer）与 PowerShell 命令执行
        ai-tools.ts            # 按策略生成本机工具定义 + 执行器
      ai/tool-loop.ts          # 工具往返循环（纯逻辑，可单测）
      bilibili/
        bilibili-client.ts     # 公开接口抓取、封面下载
        video.ts               # 稿件归一化、URL 白名单（纯函数）
        content-curator.ts     # 关键词过滤、打分、偏置随机（纯函数）
        share-composer.ts      # 分享文案模板（纯函数）
        bilibili-service.ts    # 浏览流程、历史、反馈、定时器、安静时段
    util/                      # 日志、时间、定时器
  preload/index.ts             # contextBridge 暴露类型化 API
  renderer/
    index.html
    src/
      main.ts                  # 挂载 UI、绑定事件与主进程推送
      actions.ts               # 面板事件委托（含标签切换）
      api.ts / state.ts / dom.ts / constants.ts / sprites.ts / settings.ts
      modules/
        mood.ts bubble.ts voice.ts lines.ts   # 表情、气泡、语音、台词
        roam.ts interactions.ts drag.ts        # 漫步、点击、长按/拖拽
        gestures.ts action-rules.ts            # 新动作播放与触发规则
        care.ts ai.ts bilibili.ts qq.ts access.ts # 五个功能域
        panel.ts panel-views.ts                # 标签面板与分享卡
        passthrough.ts                         # 鼠标穿透（去重，仅状态变化时 IPC）
      styles/                  # base / pet / panel / bilibili
tools/hutao-workbench/         # 工作台页面（纯静态单文件，打包到 resources/workbench）
tests/                         # node:test 单元测试（esbuild 打包后运行）
scripts/                       # 构建、打包、冒烟测试、图标与立绘处理
resources/                     # 托盘与应用图标（由立绘生成）
docs/                          # 设计文档、截图、动作原图
```

## 常用命令

```powershell
npm run dev        # 开发模式（Electron + Vite HMR）
npm run typecheck  # 主进程 + 渲染进程类型检查
npm test           # node:test 单元测试（内容筛选/文案/归一化/安静时段/持久化/服务流程）
npm run build      # typecheck + 生产构建到 out/
npm run dist       # 构建并打包 NSIS 安装版 + portable 便携版
npm run smoke      # 用仓库内 Electron 跑窗口冒烟测试（含长按回归）
npm run smoke -- --bilibili                                    # 额外抓一条 B 站视频验证网络
npm run smoke:ai                                               # 用真实存档里的 Key 打一次模型接口，验证「配上没有」
node scripts/run-smoke.cjs --capture tmp/care.png --capture-tab=care
node scripts/run-smoke.cjs --capture tmp/ai.png --capture-tab=ai
node scripts/run-smoke.cjs --capture tmp/qq.png --capture-tab=qq
node scripts/run-smoke.cjs --capture tmp/access.png --capture-tab=access
node scripts/run-smoke.cjs --capture tmp/boo.png --capture-mood=boo
node scripts/run-smoke.cjs --exe "release/win-unpacked/胡桃桌宠.exe"  # 验证打包后的 exe
powershell -ExecutionPolicy Bypass -File scripts\qq-setup.ps1 -Uin <小号QQ> -SnowLumaDir 'D:\SnowLuma'
powershell -ExecutionPolicy Bypass -File scripts\create-workbench-shortcut.ps1   # 桌面建「胡桃工作台」快捷方式
```

冒烟测试会使用临时 `userData`，不会污染真实存档；结果写入 `--smoke-result` 指定的 JSON 并打印到终端。检查项包括：窗口创建、renderer 挂载、preload 桥接、透明背景、B 站 IPC、QQ 网关与群事件、权限内核（路径守卫/限流/命令审批/审计）、工作台（监听/token/页面/动作路由）、存档落盘、托盘/应用图标、长按窗口尺寸与气泡收起。

`npm run smoke:ai` 是例外：它要读真实存档里的 API Key，所以不重定向 `userData`，也不占用单实例锁，会打印接口地址、模型名、Key 来源、真实回复与耗时、本机音色列表。

图标和动作素材可以重新生成（需要 Pillow）：

```powershell
python scripts/generate-icons.py
python scripts/process-action-sprites.py
```

## 数据与隐私

| 文件 | 内容 |
| --- | --- |
| `userData/settings.json` | 窗口位置、缩放、置顶、漫步、开机自启 |
| `userData/profile.json` | 亲密度、等级、背包、每日补给、解锁奖励 |
| `userData/ai-settings.json` | 模型接口地址、模型名、语音引擎与音色、克隆音色配置、人设、观察间隔 |
| `userData/llm-api-key.bin` | `safeStorage` 加密后的模型 API Key |
| `userData/qq-settings.json` | QQ 板块开关、端口、token、小号、群白名单、管理员 QQ、说话概率与频率 |
| `userData/access-settings.json` | 本机权限策略（开关、只读目录、打开白名单、上限、工作台端口与 token） |
| `userData/access-audit.jsonl` | 本机操作审计（谁、做了什么、成没成） |
| `userData/bilibili-settings.json` | B 站漫游开关、间隔、安静时段、兴趣关键词 |
| `userData/bilibili-history.json` | 看过的稿件、分享记录、喜欢/不感兴趣的 UP 主 |
| `userData/logs/app.log` | 运行日志（超过 1MB 自动轮转） |

- 桌面观察只读取当前应用名与窗口标题。
- 本机权限默认全关；打开后读文件/看屏幕/开程序/跑命令都受白名单、审批与审计约束，命令每次都要你确认。
- B 站分享只把视频标题/UP 主/分区/播放量交给 AI 生成文案，不上传本地文件。
- 不截图、不 OCR、不监听麦克风、不读取剪贴板（除非你点「复制链接」）。

## 已知边界

- B 站公开接口可能限流或改版；失败时只提示一句，不阻塞桌宠本体，并在 10–25 分钟后重试。
- 未做登录态 WBI 签名，因此不使用搜索接口，只从热门/排行/分区新稿里挑。
- 仅针对 Windows x64 打包；代码保留 macOS/Linux 的 Electron 兼容路径，但未验证。
- 安装包未做代码签名，首次运行可能触发 SmartScreen。
- QQ 板块依赖第三方协议端（SnowLuma / NapCat），**违反 QQ 用户协议、有封号风险**；只用小号，且协议端版本要跟着 QQ 更新。
- 系统语音走 Windows 合成，音色取决于本机已安装的 SAPI 音色；克隆音色需要自己另装 GPT-SoVITS 服务（约 2GB 磁盘 + 显卡），服务没开时只出气泡不出声。
- 本机权限没有沙箱隔离：命令以当前用户身份执行，所以「允许」之前请自己看一眼命令内容；工作台只监听 `127.0.0.1`，token 泄露等于把面板交出去，请勿外传截图中的地址。

## 参与贡献

- 开发、测试、素材规范和提交约定见 [CONTRIBUTING.md](CONTRIBUTING.md)。
- 安全问题请走 [SECURITY.md](SECURITY.md)，不要在公开 Issue 贴 Key 或用户存档。
- 版本变化见 [CHANGELOG.md](CHANGELOG.md)。

## License

代码使用 [MIT License](LICENSE)。

《原神》与胡桃角色版权归 HoYoverse 所有；本项目是非商业 fan-art，与官方无关。`src/renderer/assets/pet/` 中的立绘为本地生成的角色二创素材，请勿用于商业用途。
