# 界面接口契约

## 前端入口

浏览器继续通过标准 AG-UI SSE 入口完成对话：

```text
Vue AgentChat
  POST /dataagent/web/api/agui (Vite proxy)
    → Adapter internal /agent handler
      → OpenCode2 session / event / prompt / permission
      → A2UI MCP（以及调用方显式提供的 frontend MCP）
    ← standard AG-UI SSE
```

管理页面仍通过同一个 Adapter 访问后端能力。浏览器不保存上游 service 密码，认证和 service 自动发现由 Adapter 负责。

## 普通运行

`POST /dataagent/web/api/agui` 接收标准 `RunAgentInput`，Adapter 在提交 prompt 的同时消费原生事件流，并持续返回 AG-UI SSE：

- 文本：`TEXT_MESSAGE_START / CONTENT / END`
- 思考：`REASONING_*`
- 步骤：`STEP_STARTED / STEP_FINISHED`
- 工具：`TOOL_CALL_*`
- 状态：`STATE_SNAPSHOT`、`ACTIVITY_SNAPSHOT`
- 终态：`RUN_FINISHED` 或 `RUN_ERROR`

同一个 `threadId` 始终复用同一个 session；映射、待处理 interrupt 与最近一次 resume 回执由 Adapter 内部维护。

## 人工授权：Interrupt / Resume

上游发出权限请求时，Adapter 关闭当前仍活动的消息、工具和步骤生命周期，并通过同一条 SSE 输出 `RUN_FINISHED` interrupt。界面从 AG-UI client 的 `pendingInterrupts` 读取这些数据，并仍通过 `/dataagent/web/api/agui` + `RunAgentInput.resume` 恢复原 session。

## A2UI 与动态渲染区

当前 Vue 前端通过 `forwardedProps.a2uiCatalogAvailable` 和 `context` 广告
A2UI v0.9 catalog。Adapter 为参考 OpenCode2 注册 `render_a2ui` MCP 工具，
将其结果转换为 `a2ui-surface` activity；A2UI action 通过新的 AG-UI run
继续执行，不承担审批语义。

Adapter 仍兼容调用方提供的 `RunAgentInput.tools`，可将浏览器拥有的工具
注册到动态 MCP；当前 AgentChat 不自动注册旧版 `workspace.*` 工具。原生
OpenCode `write` 成功结果会投影为 `workspace-file` 文件卡，结构化 ZIP 使用
`workspace-archive` 只读目录/文件预览。

## Skill 管理接口

Skill 管理暂时只保留列表、上传、删除三个能力。前端直接调用以下路径，Adapter 仅做透明转发与已有认证处理，不再实现自定义 Skill 安装/删除逻辑。

| 前端接口 | 方法 | 用途 |
| --- | --- | --- |
| `/dataagent/web/api/skill` | `GET` | 获取 Skill 列表 |
| `/dataagent/web/api/skill/upload` | `POST` | 上传 Skill 技能包 |
| `/dataagent/web/api/skill/upload/delete/{skillName}` | `DELETE` | 按 Skill 名称删除 |

上传使用 `multipart/form-data`，文件字段名为 `file`。

## Workspace 管理接口

Workspace 管理暂时继续使用 Adapter 管理路由：

| Adapter 接口 | 上游 / 行为 | 用途 |
| --- | --- | --- |
| `GET /dataagent/web/api/opencode/health` | diagnostics | Workspace 管理可用性 |
| `GET /dataagent/web/api/opencode/projects` | `GET /api/project` | Project 列表 |
| `GET /dataagent/web/api/opencode/workspaces` | `GET /api/workspace` | Workspace 列表 |
| `POST /dataagent/web/api/opencode/workspaces` | `POST /api/workspace` | 创建 / 注册 Workspace |
| `GET /dataagent/web/api/opencode/workspaces/:id` | `GET /api/workspace/:id` | Workspace 元数据 |
| `PATCH /dataagent/web/api/opencode/workspaces/:id` | `PATCH /api/workspace/:id` | 更新 Workspace |
| `DELETE /dataagent/web/api/opencode/workspaces/:id` | `DELETE /api/workspace/:id` | 删除 Workspace 注册 |

## 文件与 ZIP 预览

| Adapter 接口 | 方法 | 用途 |
| --- | --- | --- |
| `/dataagent/web/api/agui/file/upload` | `POST` | 上传用户输入文件，返回同源文件地址 |
| `/dataagent/web/api/agui/file/:id` | `GET` | 读取上传文件 |
| `/dataagent/web/api/agui/workspace-file?path=...` | `GET` | 读取工作区生成文件（仅允许 workspace 内相对路径） |
| `/dataagent/web/api/agui/workspace-archive?path=...` | `GET` | 返回 ZIP 目录清单 |
| `/dataagent/web/api/agui/workspace-archive?path=...&entry=...` | `GET` | 读取 ZIP 内单个文件 |

ZIP 预览仅支持 stored/deflate 项，限制压缩包 50 MB、条目 2000 个、单文件 10 MB，并拒绝绝对路径、`..`、加密项和 ZIP64。前端右侧面板据此展示完整目录及可预览文件。

## 开发入口

以下入口仅用于 Adapter 测试，不是生产前端依赖：

| 接口 | 用途 |
| --- | --- |
| `POST /agui/mock` | 不连接上游服务的标准 AG-UI mock |
| `POST /agui/replay` | 重放捕获的原生事件 |
