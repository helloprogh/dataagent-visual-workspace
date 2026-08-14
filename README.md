# Data Agent Visual Workspace V5.2

完整的 Data Agent 可视工作区工程。Vue 前端是项目主体，OpenCode2 → AG-UI Adapter 是用于本地联调和协议转换的辅助服务。

## Repository layout

```text
.
├── frontend/   Data Agent Visual Workspace V5.2
│   ├── Vue 3 + Vite + Element Plus
│   ├── CopilotKit Vue + @ag-ui/client
│   ├── empty workspace / Demo Mode
│   ├── generative UI component registry
│   ├── conversation persistence
│   └── workspace.render / upsert / remove / agents
│
└── adapter/    Local OpenCode2 AG-UI development adapter
    ├── OpenCode2 API proxy
    ├── OpenCode2 event → standard AG-UI conversion
    ├── mock / hybrid / replay endpoints
    └── protocol and end-to-end tests
```

前端的完整说明、组件清单和 Agent 指令见 [frontend/README.md](frontend/README.md)。

## Quick start

要求 Node.js 20.19 或更高版本。

```bash
npm install
npm run dev
```

启动后：

- Visual Workspace: <http://127.0.0.1:5173>
- Adapter: <http://127.0.0.1:3001>
- Adapter health: <http://127.0.0.1:3001/health>

默认前端通过 `/api/agui` 代理到 Adapter 的标准 `/agent` 接口。Adapter 再连接本地 OpenCode2：

```powershell
opencode serve --hostname 127.0.0.1 --port 4096
$env:OPENCODE_BASE_URL='http://127.0.0.1:4096'
npm run dev
```

## Empty workspace and Demo Mode

生产式空工作区：

```bash
npm run dev
```

内置完整演示数据：

```bash
npm run dev:demo
```

两种模式分别使用：

```text
dataagent.workspace.v3.prod
dataagent.workspace.v3.demo
```

## Adapter endpoints

| Endpoint | Purpose |
| --- | --- |
| `POST /agent` | 前端默认入口，连接 OpenCode2 并输出标准 AG-UI SSE |
| `POST /agui` | `/agent` 的显式别名 |
| `POST /agui/mock` | 无需 OpenCode2 的标准 AG-UI mock 流 |
| `POST /agui/hybrid` | OpenCode2 真实事件 + Workspace 调试事件 |
| `POST /agui/replay` | 离线重放捕获的 OpenCode2 事件 |
| `/opencode/*` | OpenCode2 API 透传 |

协议映射见 [adapter/docs/EVENT-MAPPING.md](adapter/docs/EVENT-MAPPING.md)。

## Validation

```bash
npm run check:offline
npm test
npm run typecheck
npm run build
npm run build:demo
```

