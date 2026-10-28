# Security Policy

## Supported versions

当前维护 `main` 分支的最新版本。

## Reporting a vulnerability

请不要在公开 Issue 中粘贴 API Key、Cookie、用户存档或可复现的隐私数据。

优先使用 GitHub 的 [Private vulnerability reporting](https://github.com/iotyunhe/Desktop-Pet-Hutao/security/advisories/new)：
描述影响版本、复现步骤和风险，我会尽快确认。

## Scope

- Electron 主进程 / preload / 渲染层的代码执行与 IPC 边界。
- 外部链接打开、B 站封面下载、API Key 加密存储。
- 依赖供应链问题（请附 CVE 或上游公告）。

## Not in scope

- 用户自行修改源码、注入脚本或使用第三方修改版导致的问题。
- B 站接口限流、内容版权或账号风控。
- 《原神》/胡桃角色版权争议（本项目是非商业 fan-art）。
