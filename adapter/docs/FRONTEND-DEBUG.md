# 前端联调模式

## 真实 OpenCode2

```bash
npm run dev
```

前端 `/api/agui` 代理到 Adapter 的 `/agent`。Adapter 自动发现 `opencode2 serve --service` 的动态端口与本机认证。

## 真实 OpenCode2（场景别名）

```bash
npm run dev:scenario
```

该模式代理到 `/agui/hybrid`，但它与 `/agent` 使用同一条真实链路，不再额外注入固定场景。工作区内容只会在 OpenCode2 调用前端下发的 `workspace.*` 工具后生成。

## 纯 Mock

直接向 `POST http://127.0.0.1:3001/agui/mock` 发送 `RunAgentInput`，无需 OpenCode2 即可检查完整 AG-UI SSE。

## Replay

向 `/agui/replay` 提交 `input`、`sessionId` 和捕获的 `events` 数组。可用于离线复现特定 OpenCode2 原生事件。

## 页面内联调面板

协议联调与接口能力面板常驻在右侧对话区下方，无需展开，授权操作始终可见。面板显示：

- OpenCode2 连接、版本与动态地址；
- 9 个支持/调试场景；
- 当前 threadId → sessionID 映射；
- 活动上下文摘要；
- 待处理工具授权；
- 前端工具动态 MCP 链路及全部界面接口与 OpenCode2 上游接口。
