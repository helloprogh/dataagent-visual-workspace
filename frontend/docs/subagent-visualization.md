# Multi-Agent Visualization Contract

V5 新增三类子 Agent 可视化：

- `ui.agentGraph`：主 Agent / 子 Agent 拓扑、状态、进度、工具和结果。
- `ui.agentTimeline`：并行 / 串行执行时序与耗时。
- `ui.agentActivity`：实时活动事件流。

## 模型控制

前端工具 `workspace.agents` 会同时刷新上述三个模块，适合 Demo 或模型已经掌握子 Agent 状态的场景。

## 后续接真实 AG-UI 子 Agent 事件

保持一个外层 AG-UI Run，不为每个子 Agent 再创建嵌套 RUN_STARTED / RUN_FINISHED。内部子 Agent 事件推荐映射为 CUSTOM：

```json
{
  "type": "CUSTOM",
  "name": "subagent.started",
  "value": {
    "agentId": "sql-agent",
    "name": "SQL Agent",
    "parentAgentId": "orchestrator",
    "task": "查询最近30天销售趋势",
    "status": "running"
  }
}
```

推荐事件名：`subagent.started`、`subagent.progress`、`subagent.completed`、`subagent.failed`、`subagent.activity`。
