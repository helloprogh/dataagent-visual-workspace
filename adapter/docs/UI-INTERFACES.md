# 界面接口契约

## 前端入口

浏览器继续通过标准 AG-UI SSE 入口完成对话：

```text
CopilotChat
  POST /api/agui (Vite proxy)
    → POST /agent
      → OpenCode2 session / event / prompt / permission
      → dynamic frontend MCP
    ← standard AG-UI SSE
```

除对话外，管理页面通过同一个 Adapter 暴露的 `/api/opencode/*` 接口访问 OpenCode2。浏览器不保存 OpenCode2 service 密码，认证和 service 自动发现仍由 Adapter 负责。

## 普通运行

`POST /agent` 接收标准 `RunAgentInput`，Adapter 在提交 OpenCode2 prompt 的同时消费原生事件流，并持续返回 AG-UI SSE：

- 文本：`TEXT_MESSAGE_START / CONTENT / END`
- 思考：`REASONING_*`
- 步骤：`STEP_STARTED / STEP_FINISHED`
- 工具：`TOOL_CALL_*`
- 状态：`STATE_SNAPSHOT`、`ACTIVITY_SNAPSHOT`
- 终态：`RUN_FINISHED` 或 `RUN_ERROR`

同一个 `threadId` 始终复用同一个 OpenCode2 session；映射、待处理 interrupt 与最近一次 resume 回执持久化在 Adapter 内部，不暴露给浏览器。

## 人工授权：Interrupt / Resume

OpenCode2 发出 `permission.asked` 时，Adapter 关闭当前仍活动的消息、工具和步骤生命周期，并通过同一条 SSE 输出 `RUN_FINISHED` interrupt。界面从 AG-UI client 的 `pendingInterrupts` 读取这些数据，并仍通过 `/agent` + `RunAgentInput.resume` 恢复原 session。

## 前端工具与动态渲染区

前端通过 `RunAgentInput.tools` 注册内部 `workspace.render/upsert/remove/agents` 工具。这里的 `workspace.*` 仅是生成式 UI 的兼容协议名；界面上统一称为 **Dynamic Render Space / 动态渲染区**，不要与 OpenCode2 Workspace 混淆。

动态渲染区状态通过 `RunAgentInput.state` 与 `STATE_SNAPSHOT` 同步。任务和子 Agent 状态通过 `ACTIVITY_SNAPSHOT` 同步。

## OpenCode2 管理接口

| Adapter 接口 | 上游 / 行为 | 用途 |
| --- | --- | --- |
| `GET /api/opencode/health` | OpenCode2 diagnostics | Service 状态 |
| `GET /api/opencode/skills` | `GET /api/skill` | Skill 列表 |
| `POST /api/opencode/skills/install` | 安全解压到 OpenCode2 Skill discovery path | 上传 ZIP 技能包 |
| `DELETE /api/opencode/skills/:id?location=...&workspaceID=...` | 校验 `/api/skill` 注册结果后删除受控 Skill 目录 | 删除 Skill |
| `GET /api/opencode/projects` | `GET /api/project` | Project 列表 |
| `GET /api/opencode/workspaces` | `GET /api/workspace` | Workspace 列表 |
| `POST /api/opencode/workspaces` | `POST /api/workspace` | 创建 / 注册 Workspace |
| `GET /api/opencode/workspaces/:id` | `GET /api/workspace/:id` | Workspace 元数据 |
| `PATCH /api/opencode/workspaces/:id` | `PATCH /api/workspace/:id` | 更新 Workspace |
| `DELETE /api/opencode/workspaces/:id` | `DELETE /api/workspace/:id` | 删除 Workspace 注册 |

### Skill 删除约束

Skill 删除是文件系统级卸载，不只是从 UI 隐藏。Adapter 会重新通过 OpenCode2 `/api/skill` 校验 `id + location`，并且只允许删除：

- OpenCode2 Global Skill 根目录下的直接子目录；
- 已注册 OpenCode2 Workspace 的 `<directory>/.opencode/skills` 下的直接子目录。

目标必须是普通目录且包含根级 `SKILL.md`。符号链接、未注册目标、任意路径以及其他外部 Skill 来源不会被删除。

## 开发入口

以下入口仅用于 Adapter 测试，不是生产前端依赖：

| 接口 | 用途 |
| --- | --- |
| `POST /agui/mock` | 不连接 OpenCode2 的标准 AG-UI mock |
| `POST /agui/replay` | 重放捕获的 OpenCode2 原生事件 |
