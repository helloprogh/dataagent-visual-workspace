# 界面接口契约

## 对话主链：标准 AG-UI

聊天与生成式 UI 仍只依赖一个标准 AG-UI SSE 入口：

```text
CopilotChat
  POST /api/agui (Vite proxy)
    → POST /agent
      → OpenCode2 session / event / prompt / permission
      → dynamic frontend MCP
    ← standard AG-UI SSE
```

`threadId → OpenCode2 sessionID`、权限请求 ID 和 MCP 注册都由 Adapter 内部维护。聊天前端不需要访问这些内部映射。

## OpenCode2 管理接口

左侧的 **Skill 管理** 与 **工作空间管理** 对应 OpenCode2 原生概念，不属于 AG-UI 对话协议。浏览器通过同一个 Adapter 的 `/api/opencode/*` 访问，Adapter 复用 OpenCode2 service 自动发现与本机认证，浏览器不直接持有 OpenCode2 密码。

| 前端接口 | 上游 / 行为 | 用途 |
| --- | --- | --- |
| `GET /api/opencode/health` | OpenCode2 service diagnostics | 管理页连接状态 |
| `GET /api/opencode/skills` | `GET /api/skill` | 读取当前运行上下文可发现的 Skill |
| `POST /api/opencode/skills/install` | 安全落盘到 OpenCode2 Skill discovery 目录 | 上传 ZIP 技能包 |
| `GET /api/opencode/projects` | `GET /api/project` | Workspace 创建时选择 Project |
| `GET /api/opencode/workspaces` | `GET /api/workspace` | Workspace 列表 |
| `POST /api/opencode/workspaces` | `POST /api/workspace` | 创建 / 注册 Workspace |
| `GET /api/opencode/workspaces/:id` | `GET /api/workspace/:id` | Workspace 元数据 |
| `PATCH /api/opencode/workspaces/:id` | `PATCH /api/workspace/:id` | 更新 Workspace |
| `DELETE /api/opencode/workspaces/:id` | `DELETE /api/workspace/:id` | 删除 Workspace 注册 |

### Skill ZIP 上传

```text
POST /api/opencode/skills/install?scope=global
POST /api/opencode/skills/install?scope=workspace&workspaceID=<id>
Content-Type: application/zip
x-skill-package-name: my-skill.zip
```

可选 `replace=true` 覆盖同名 Skill。Adapter 会：

1. 限制压缩包大小、解压后大小和文件数量；
2. 拒绝 ZIP64、加密条目、符号链接、绝对路径、路径穿越和重复路径；
3. 要求一个技能包中恰好存在一个 `SKILL.md`；
4. 先完整解压到临时目录并校验，再替换已有 Skill；
5. Global 安装到 OpenCode2 全局 Skill discovery 目录；Workspace 安装到该 Workspace 的 `.opencode/skills/<skill-id>`；
6. `scripts/`、`references/` 等与 `SKILL.md` 同目录的辅助文件会一起安装。

Skill 注册状态最终仍以 OpenCode2 `GET /api/skill` 的返回结果为准。

## OpenCode2 Workspace 与动态渲染区的区别

这两个概念必须严格分离：

- **OpenCode2 Workspace**：OpenCode2 server-scoped workspace lifecycle，用于目录 / Project / Runtime Context 管理；由 `/api/workspace` 系列接口管理。
- **动态渲染区**：Data Agent 前端的生成式 UI 区域，内部仍由 `workspace.render/upsert/remove/agents` 等 frontend tools 驱动。这里的 `workspace.*` 是既有前端工具协议名称，不代表 OpenCode2 Workspace。

界面可见文案统一使用“动态渲染区 / Dynamic Render Space”指代后者，避免概念混淆。

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

OpenCode2 发出 `permission.asked` 时，Adapter 关闭当前仍活动的消息、工具和步骤生命周期，并通过同一条 SSE 输出 `RUN_FINISHED` interrupt。界面从 AG-UI client 的 `pendingInterrupts` 读取数据，在输入框上方显示授权卡片，并通过同一个 `/agent` 请求携带 `RunAgentInput.resume` 恢复执行。

Adapter 校验 resume 覆盖全部待处理 interrupt，再调用 OpenCode2 permission reply 并继续原 session。恢复后的工具结果使用原 `toolCallId`，不会重复发送 `TOOL_CALL_START / ARGS / END`。

## 前端工具与生成式 UI

前端通过 `RunAgentInput.tools` 注册 `workspace.render/upsert/remove/agents`。Adapter 将这些工具注册为内部动态 MCP；OpenCode2 调用后，Adapter 输出标准 `TOOL_CALL_*`，浏览器执行 handler，再通过标准 `ToolMessage` 和同一个 `/agent` 入口续跑。

生成式 UI 状态通过 `RunAgentInput.state` 与 `STATE_SNAPSHOT` 同步。任务和子 Agent 状态通过 `ACTIVITY_SNAPSHOT` 同步，不需要额外 HTTP 接口。

## 开发入口

以下入口仅用于 Adapter 测试：

| 接口 | 用途 |
| --- | --- |
| `POST /agui/mock` | 不连接 OpenCode2 的标准 AG-UI mock |
| `POST /agui/replay` | 重放捕获的 OpenCode2 原生事件 |
