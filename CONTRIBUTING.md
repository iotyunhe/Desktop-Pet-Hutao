# 贡献指南

感谢你愿意一起完善胡桃桌宠。这个项目是本地运行的非商业 fan-art 项目，代码使用 MIT 协议。

## 开发环境

- Windows 10/11 x64（其他平台未验证）
- Node.js 22 或更新版本
- npm 10+

```powershell
git clone https://github.com/iotyunhe/Desktop-Pet-Hutao.git
cd Desktop-Pet-Hutao
npm install
npm run dev
```

## 提交前检查

```powershell
npm run typecheck
npm test
npm run build
```

如果改动涉及窗口、面板、气泡或动作触发，建议再跑一次真实 Electron 冒烟测试：

```powershell
npm run smoke
node scripts/run-smoke.cjs --capture tmp/panel.png --capture-tab=bilibili
node scripts/run-smoke.cjs --capture tmp/boo.png --capture-mood=boo
```

长按、气泡、窗口尺寸相关的改动会被冒烟测试里的 `longpress` 探针覆盖。

## 代码约定

- TypeScript `strict`，不要引入 `any` 逃逸；共享类型放在 `src/shared/`。
- 主进程不直接拼 HTML，渲染层不直接访问 Node API。
- 所有持久化 JSON 走 `JsonStore`，读取时归一化，写入使用原子替换。
- 新动作：先在 `docs/action-design.md` 记录设计，再按现有 `PetMood` / `sprites.ts` / CSS 动画 / `gestures.ts` 的路径接入。
- 提交信息建议使用 Conventional Commits，例如 `feat(panel): split care and config into tabs`、`fix(drag): ignore click after long press`。

## 美术素材

- 立绘使用本地 imagegen 生成，再由 `scripts/process-action-sprites.py` 处理成透明 PNG。
- 统一 1024×1024、脚底 baseline 对齐、四角 alpha 为 0、无水印。
- 不要提交来源不明或带商业授权的角色素材。
- 《原神》与胡桃角色版权归 HoYoverse 所有；本项目是非商业 fan-art，不代表官方。

## 隐私与密钥

- 不要提交 `.env`、API Key、用户 `userData` 目录或任何个人信息。
- MiniMax Key 由 Electron `safeStorage` 加密保存在本机，不会进入仓库。
- B 站接口使用匿名公开接口；可选 Cookie 只从环境变量读取，不落盘。

## Pull Request

1. 从 `main` 切分支，保持改动聚焦。
2. 附上改动说明、复现步骤（如果是修复）和截图（如果是 UI）。
3. 确认 `typecheck`、`test`、`build` 通过。
4. 不要在一个 PR 里混入无关的格式化或依赖升级。
