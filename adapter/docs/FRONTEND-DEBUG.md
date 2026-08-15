# 前端联调模式

## 真实 OpenCode2

```bash
npm run dev
```

前端 `/api/agui` 代理到 Adapter 的 `/agent`。Adapter 自动发现 `opencode2 serve --service` 的动态端口与本机认证。

## 真实 OpenCode2（场景启动命令）

```bash
npm run dev:scenario
```

该模式同样代理到 `/agent`，不额外注入固定场景。工作区内容只会在 OpenCode2 调用前端下发的 `workspace.*` 工具后生成。

## 纯 Mock

直接向 `POST http://127.0.0.1:3001/agui/mock` 发送 `RunAgentInput`，无需 OpenCode2 即可检查完整 AG-UI SSE。

## Replay

向 `/agui/replay` 提交 `input`、`sessionId` 和捕获的 `events` 数组。可用于离线复现特定 OpenCode2 原生事件。

## 页面内人工授权

项目不再提供会话与协议联调面板，也不轮询任何调试接口。OpenCode2 权限请求转换为标准 `RUN_FINISHED.outcome.interrupts`，授权卡片仅在需要时显示在输入框上方，并通过同一个 `/agent` 入口提交 `RunAgentInput.resume`。
