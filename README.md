# Data Agent Visual Workspace V5.2

完整的 Data Agent 可视工作区工程。Vue 前端是项目主体，OpenCode2 → AG-UI Adapter 是本地联调、协议转换和会话桥接服务。

## 工程结构

```text
.
├─ frontend/   Vue 3 + CopilotKit + AG-UI 可视工作区
│  ├─ 空工作区 / Demo Mode / OpenCode2 场景模式
│  ├─ Generative UI 组件注册表
│  ├─ 主 Agent 聊天与本地会话列表
│  └─ 输入框上方的标准 AG-UI 人工授权卡片
└─ adapter/    本地 OpenCode2 → AG-UI Adapter
   ├─ 自动发现 `opencode2 serve --service`
   ├─ OpenCode2 v2 `/api` 接口与本机认证
   ├─ 原生事件 → 标准 AG-UI 事件转换
   ├─ threadId → sessionID 持久化映射
   ├─ AG-UI frontend tools → 动态 MCP → ToolMessage 续跑
   └─ mock / replay 开发入口
```

## 快速启动

要求 Node.js 20.19 或更高版本，并确保本地 OpenCode2 service 正在运行：

```powershell
opencode2 serve --service
npm install
npm run dev
```

启动后：

- 前端：<http://127.0.0.1:5173>
- Adapter：<http://127.0.0.1:3001>

Adapter 默认读取 OpenCode2 的 service 注册文件，自动获得动态端口和本机认证，不需要把密码写进项目。也可以通过 `OPENCODE_BASE_URL`、`OPENCODE_PASSWORD` 显式覆盖。

## 三种前端模式

```bash
# 空工作区 + 真实 OpenCode2
npm run dev

# 空工作区 + 真实 OpenCode2（兼容场景入口）
npm run dev:scenario

# 隔离的静态 Demo 数据
npm run dev:demo
```

`dev` 与 `dev:scenario` 都使用真实 OpenCode2，不再注入固定工作区。浏览器只调用 `/api/agui`，由 Vite 代理到 `POST /agent`。CopilotKit 通过标准 `RunAgentInput.tools` 下发 `workspace.render/upsert/remove/agents`，Adapter 把它们注册为动态 MCP；OpenCode2 调用后，浏览器执行工具并用标准 `ToolMessage` 回传结果。

OpenCode2 请求工具授权时，Adapter 在同一条 SSE 中返回 `RUN_FINISHED.outcome.interrupts`。界面在输入框上方显示“允许一次 / 始终允许 / 拒绝”，并通过同一个 `/agent` 请求携带 `RunAgentInput.resume` 恢复执行；没有 session、permission、context 或 capability 辅助接口。两端都会持久化待处理 interrupt，刷新页面或重启 Adapter 后仍可继续。

## 关键入口

| 接口 | 用途 |
| --- | --- |
| `POST /agent` | 前端默认 AG-UI SSE 入口，连接真实 OpenCode2 |
| `POST /agui/mock` | 不依赖 OpenCode2 的完整 AG-UI mock |
| `POST /agui/replay` | 离线重放 OpenCode2 原生事件 |

完整接口见 [adapter/docs/UI-INTERFACES.md](adapter/docs/UI-INTERFACES.md)，事件转换见 [adapter/docs/EVENT-MAPPING.md](adapter/docs/EVENT-MAPPING.md)。

## 验证

```bash
npm test
npm run typecheck
npm run build
npm run build:scenario
npm run build:demo
```
