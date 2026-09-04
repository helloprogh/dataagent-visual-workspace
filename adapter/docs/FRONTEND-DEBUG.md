# 前端联调模式

## 真实 OpenCode2

```bash
npm run dev
```

前端 `/dataagent/web/api/agui` 代理到 Adapter 的 AG-UI handler。`npm run dev` 默认固定连接参考 `opencode-dataagent-v2` 的 `http://127.0.0.1:4096`，避免误连本机其它 OpenCode；可用 `OPENCODE_BASE_URL`、`OPENCODE_PASSWORD` 和 `OPENCODE_WORKSPACE_DIRECTORY` 覆盖。

## 真实 OpenCode2（场景启动命令）

```bash
npm run dev:scenario
```

该模式同样连接真实参考 OpenCode2，不额外注入固定场景。生成式 UI 通过 A2UI catalog 和 `render_a2ui` MCP 传递；原生 `write` 结果可投影为工作区文件卡。

## 纯 Mock

直接向 `POST http://127.0.0.1:3001/agui/mock` 发送 `RunAgentInput`，无需 OpenCode2 即可检查完整 AG-UI SSE。

## Replay

向 `/agui/replay` 提交 `input`、`sessionId` 和捕获的 `events` 数组。可用于离线复现特定 OpenCode2 原生事件。

## 页面内人工授权

项目不再提供会话与协议联调面板，也不轮询任何调试接口。OpenCode2 权限请求转换为标准 `RUN_FINISHED.outcome.interrupts`，授权卡片仅在需要时显示在输入框上方，并通过同一个 `/dataagent/web/api/agui` 入口提交 `RunAgentInput.resume`。
