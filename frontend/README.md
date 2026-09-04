# Data Agent Frontend

本分支将前端从 CopilotKit + Generative Workspace 重构为：

```text
Vue 3
+ TypeScript
+ Vite 8
+ Element Plus
+ Element-Plus-X
+ @ag-ui/client
+ A2UI v0.9 Native Catalog
```

目标是保留 `main` 已有的 Data Agent 核心能力，同时将生成式 UI 收敛到受校验的 A2UI surface、原生文件交付卡片和可恢复的人机审批流程。

## 当前能力

- 新建会话：第一次发送时创建 OpenCode2 Session。
- 会话列表与历史切换。
- `/session/{id}/message` 历史分页加载。
- Assistant Streaming。
- Reasoning 独立展示。
- Tool Call / Tool Result 展示。
- 模型列表、默认模型与 Session 级模型切换。
- 文件选择、首次发送延迟上传、已有 Session 上传。
- AG-UI Interrupt / Resume。
- Pending Interrupt 刷新恢复。
- Stop：前端 Abort Run + OpenCode Session Interrupt。
- A2UI v0.9 白名单组件与 action 回传。
- `dataagent.ui` 文件、Markdown、指标和表格卡片。
- 工作区文件与结构化 ZIP 目录/文件预览。
- 单审批快捷确认，以及多审批完整汇总恢复。
- 右侧预览与对话卡片共用的确认并继续/取消入口。
- Skill 查询、上传、删除。
- Tool / MCP Capability 管理页面。
- Light / Dark Theme。

本分支明确不提供：

- 旧 Workspace Canvas。
- `workspace.render / upsert / remove / agents` 前端工具。
- CopilotKit Runtime。
- 旧 GenUI Widget Registry。

生成式 UI 只接受 Adapter 校验后的结构化内容；模型不能直接注入 HTML、JavaScript、Vue 模板或任意文件地址。

OpenCode 后端自身的 Workspace 管理能力没有因此被删除；只是当前新前端不提供对应 Workspace 页面。

## 前端目录

```text
src/
├── app/
│   └── App.vue
├── agui/
│   └── client.ts
├── features/
│   ├── conversation/
│   │   ├── api/
│   │   ├── components/
│   │   ├── composables/
│   │   ├── pages/
│   │   └── types.ts
│   ├── model/
│   │   ├── api/
│   │   ├── components/
│   │   └── types.ts
│   ├── skill/
│   │   ├── api/
│   │   └── pages/
│   └── tool/
│       ├── api/
│       └── pages/
├── shared/
│   ├── api/
│   ├── config/
│   ├── styles/
│   └── theme/
├── a2ui/
│   ├── catalog.ts
│   ├── NativeA2uiSurface.vue
│   └── sanitizeOperations.ts
├── i18n/
│   └── index.ts
├── router/
│   └── index.ts
├── env.d.ts
└── main.ts
```

### 职责

`app/`
: 应用装配、页面切换和全局布局，不放具体业务实现。

`agui/`
: `@ag-ui/client` 的 Agent 创建、AG-UI endpoint 与 hydration client。

`a2ui/`
: A2UI catalog、组件白名单、操作清洗和 Native Vue renderer；不执行模型代码。

`features/`
: 按业务领域组织能力，不建立一个全局 `components/` 大目录。

`shared/`
: HTTP、API 路径、Design Token、Theme 等跨领域基础能力。

`i18n/` 与 `router/`
: `vue-i18n` 文案资源和 `createWebHashHistory` 路由装配。

## Conversation Runtime

```text
Element-Plus-X
      ↓
Conversation feature
      ↓
@ag-ui/client HttpAgent
      ↓
/dataagent/web/api/agui
      ↓
OpenCode2 → AG-UI Adapter
```

其中：

```text
threadId = OpenCode2 sessionId
```

历史仍从：

```text
GET /dataagent/web/api/session/{sessionId}/message
```

获取，不新增 Timeline API。

## Interrupt 恢复

服务端仍保存 pending Interrupt correlation。

重新进入已有 Session 时：

```text
/message
→ 恢复历史

同一个 AG-UI endpoint hydration run
→ 恢复 pending Interrupt
```

Hydration 使用：

```text
forwardedProps.dataagent.mode = hydrate
```

它不会调用模型、不会生成新消息，只恢复当前 AG-UI Interrupt 状态。

Resume 仍使用标准：

```text
RunAgentInput.resume[]
```

并要求一次覆盖当前 Run 的全部 pending Interrupt。

## UI 组件选型

| 场景 | 实现 |
|---|---|
| 基础业务 UI | Element Plus |
| Welcome / Sender / Bubble | Element-Plus-X |
| Chat Markdown | x-markdown-vue |
| Agent Runtime | `@ag-ui/client` |
| 生成式 UI | A2UI v0.9 Native Catalog + `dataagent.ui` |
| 文件交付 | `GeneratedArtifactCard` + `FilePreviewPanel` |
| 审批恢复 | `InterruptCard` + `RunAgentInput.resume[]` |
| 后续 Chart | raw `echarts` |
| 后续 Editable Markdown Artifact | Milkdown / Crepe |

后两项尚未因为当前功能而提前加入实现。

## Style

新前端统一使用现有 Data Agent Design Token / CSS Variables。

要求：

- 可主题化视觉值使用 Token。
- 业务尺寸使用 `rem`。
- 不使用 `html { font-size: 62.5%; }`。
- Element Plus / Element-Plus-X 从同一 Theme Token 派生。

## Runtime Requirements

```text
Node.js >= 20.19.0
```

当前构建基线：

```text
Vite            8.2.2
Vue             3.5.42
Element Plus    2.14.5
Element-Plus-X  2.0.3
@ag-ui/client   0.0.57
```

## 启动

在仓库根目录：

```bash
npm ci
npm run dev
```

只启动前端：

```bash
npm run dev:frontend
```

默认开发代理：

```text
/dataagent/web/api/*
→ http://localhost:3001
```

可通过：

```text
VITE_AGUI_PROXY_TARGET
VITE_AGUI_UPLOAD_PROXY_TARGET
```

调整开发代理目标。

## 校验

```bash
npm test -w adapter
npm run check:offline -w frontend
npm run typecheck -w frontend
npm run build -w frontend
```

本分支 CI 使用 Node.js `20.19.0` 执行 `npm ci`、Adapter tests、offline check、typecheck 和 Vite production build。
