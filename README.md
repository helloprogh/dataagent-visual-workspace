# Data Agent Visual Workspace V5.2

完整的 Data Agent 可视工作区工程。Vue 前端是项目主体，OpenCode2 → AG-UI Adapter 是本地联调、协议转换和会话桥接服务。

## 工程结构

```text
.
├─ frontend/   Vue 3 + CopilotKit + AG-UI 可视工作区
│  ├─ 空工作区 / Demo Mode / OpenCode2 场景模式
│  ├─ Generative UI 组件注册表
│  ├─ 主 Agent 聊天与本地会话列表
│  └─ 协议联调与接口能力面板
└─ adapter/    本地 OpenCode2 → AG-UI Adapter
   ├─ 自动发现 `opencode2 serve --service`
   ├─ OpenCode2 v2 `/api` 接口与本机认证
   ├─ 原生事件 → 标准 AG-UI 事件转换
   ├─ threadId → sessionID 持久化映射
   └─ mock / hybrid / replay / debug 接口
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
- 健康检查：<http://127.0.0.1:3001/health>
- 能力清单：<http://127.0.0.1:3001/debug/capabilities>

Adapter 默认读取 OpenCode2 的 service 注册文件，自动获得动态端口和本机认证，不需要把密码写进项目。也可以通过 `OPENCODE_BASE_URL`、`OPENCODE_PASSWORD` 显式覆盖。

## 三种前端模式

```bash
# 空工作区 + 真实 OpenCode2
npm run dev

# 空工作区 + 真实 OpenCode2 + 可视协议联调场景
npm run dev:scenario

# 隔离的静态 Demo 数据
npm run dev:demo
```

`dev:scenario` 仍使用真实 OpenCode2 回答，只额外注入标准 AG-UI `workspace.render` / `workspace.agents` 调试事件，方便检查主 Agent、子 Agent、工具、思考、任务状态和可视工作区。

## 关键入口

| 接口 | 用途 |
| --- | --- |
| `POST /agent` | 前端默认 AG-UI SSE 入口，连接真实 OpenCode2 |
| `POST /agui/hybrid` | 真实 OpenCode2 + 可视场景事件 |
| `POST /agui/mock` | 不依赖 OpenCode2 的完整 AG-UI mock |
| `POST /agui/replay` | 离线重放 OpenCode2 原生事件 |
| `GET /debug/capabilities` | 服务状态、支持场景、界面接口目录 |
| `GET /debug/sessions` | threadId / sessionID 映射与任务状态 |
| `GET /debug/sessions/:threadId/context` | 当前会话活动上下文 |
| `/opencode/*` | 带本机认证的 OpenCode2 `/api` 透传 |

完整接口见 [adapter/docs/UI-INTERFACES.md](adapter/docs/UI-INTERFACES.md)，事件转换见 [adapter/docs/EVENT-MAPPING.md](adapter/docs/EVENT-MAPPING.md)。

## 验证

```bash
npm test
npm run typecheck
npm run build
npm run build:scenario
npm run build:demo
```
