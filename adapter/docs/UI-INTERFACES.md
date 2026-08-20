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

管理页面仍通过同一个 Adapter 访问后端能力。浏览器不保存上游 service 密码，认证和 service 自动发现由 Adapter 负责。

## 普通运行

`POST /agent` 接收标准 `RunAgentInput`，Adapter 在提交 prompt 的同时消费原生事件流，并持续返回 AG-UI SSE：

- 文本：`TEXT_MESSAGE_START / CONTENT / END`
- 思考：`REASONING_*`
- 步骤：`STEP_STARTED / STEP_FINISHED`
- 工具：`TOOL_CALL_*`
- 状态：`STATE_SNAPSHOT`、`ACTIVITY_SNAPSHOT`
- 终态：`RUN_FINISHED` 或 `RUN_ERROR`

同一个 `threadId` 始终复用同一个 session；映射、待处理 interrupt 与最近一次 resume 回执由 Adapter 内部维护。

## 人工授权：Interrupt / Resume

上游发出权限请求时，Adapter 关闭当前仍活动的消息、工具和步骤生命周期，并通过同一条 SSE 输出 `RUN_FINISHED` interrupt。界面从 AG-UI client 的 `pendingInterrupts` 读取这些数据，并仍通过 `/agent` + `RunAgentInput.resume` 恢复原 session。

## 前端工具与动态渲染区

前端通过 `RunAgentInput.tools` 注册内部 `workspace.render/upsert/remove/agents` 工具。这里的 `workspace.*` 仅是生成式 UI 的兼容协议名；界面上统一称为 **Dynamic Render Space / 动态渲染区**。

动态渲染区状态通过 `RunAgentInput.state` 与 `STATE_SNAPSHOT` 同步。任务和子 Agent 状态通过 `ACTIVITY_SNAPSHOT` 同步。

## Skill 管理接口

Skill 管理暂时只保留列表、上传、删除三个能力。前端直接调用以下路径，Adapter 仅做透明转发与已有认证处理，不再实现自定义 Skill 安装/删除逻辑。

| 前端接口 | 方法 | 用途 |
| --- | --- | --- |
| `/opencode/api/skill` | `GET` | 获取 Skill 列表 |
| `/opencode/api/skill/upload` | `POST` | 上传 Skill 技能包 |
| `/opencode/api/skill/upload/delete/{skillName}` | `DELETE` | 按 Skill 名称删除 |

上传使用 `multipart/form-data`，文件字段名为 `file`。

## Workspace 管理接口

Workspace 管理暂时继续使用 Adapter 管理路由：

| Adapter 接口 | 上游 / 行为 | 用途 |
| --- | --- | --- |
| `GET /api/opencode/health` | diagnostics | Workspace 管理可用性 |
| `GET /api/opencode/projects` | `GET /api/project` | Project 列表 |
| `GET /api/opencode/workspaces` | `GET /api/workspace` | Workspace 列表 |
| `POST /api/opencode/workspaces` | `POST /api/workspace` | 创建 / 注册 Workspace |
| `GET /api/opencode/workspaces/:id` | `GET /api/workspace/:id` | Workspace 元数据 |
| `PATCH /api/opencode/workspaces/:id` | `PATCH /api/workspace/:id` | 更新 Workspace |
| `DELETE /api/opencode/workspaces/:id` | `DELETE /api/workspace/:id` | 删除 Workspace 注册 |

## 开发入口

以下入口仅用于 Adapter 测试，不是生产前端依赖：

| 接口 | 用途 |
| --- | --- |
| `POST /agui/mock` | 不连接上游服务的标准 AG-UI mock |
| `POST /agui/replay` | 重放捕获的原生事件 |
