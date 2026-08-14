# 前端联调模式

## 真实 OpenCode2

```bash
npm run dev
```

前端 `/api/agui` 代理到 Adapter 的 `/agent`。Adapter 自动发现 `opencode2 serve --service` 的动态端口与本机认证。

## 真实 OpenCode2 + 场景显示

```bash
npm run dev:scenario
```

该模式代理到 `/agui/hybrid`。真实文本、思考、工具和执行状态仍来自 OpenCode2，同时用标准 AG-UI tool/custom 事件生成协议链路、同步/异步状态和多 Agent 编排模块。

## 纯 Mock

直接向 `POST http://127.0.0.1:3001/agui/mock` 发送 `RunAgentInput`，无需 OpenCode2 即可检查完整 AG-UI SSE。

## Replay

向 `/agui/replay` 提交 `input`、`sessionId` 和捕获的 `events` 数组。可用于离线复现特定 OpenCode2 原生事件。

## 页面内联调面板

右侧 Data Agent 标题栏的 `</>` 按钮会打开协议联调面板，显示：

- OpenCode2 连接、版本与动态地址；
- 9 个支持/调试场景；
- 当前 threadId → sessionID 映射；
- 活动上下文摘要；
- 待处理工具授权；
- 8 组界面接口与 OpenCode2 上游接口。
