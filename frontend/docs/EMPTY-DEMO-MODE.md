# Empty Workspace + Demo Mode

## 目标

默认生产模式不预置任何业务 mock 数据。新 thread 的 Workspace 从 0 个 module 开始，所有 KPI、图表、洞察、SQL、数据质量与子 Agent 可视化都由 Agent 运行时通过 AG-UI 驱动。

## 默认模式

```env
VITE_DEMO_MODE=false
```

初始文档：

```ts
{
  threadId,
  title: '智能分析工作区',
  subtitle: '告诉 Data Agent 你想分析什么，界面会随着分析过程动态生成',
  widgets: []
}
```

## Demo Mode

```bash
npm run dev:demo
```

等价于使用 Vite `demo` mode，并加载项目根目录 `.env.demo`：

```env
VITE_DEMO_MODE=true
```

完整示例数据集中维护在：

```text
src/workspace/demo-data.ts
```

业务组件本身不包含 Demo seed。

## Storage isolation

```text
production: dataagent.workspace.v3.prod
demo:       dataagent.workspace.v3.demo
```

两个模式不共享 Workspace persistence。旧版 `dataagent.workspace.v2` 不再读取，避免过去自动 seed 的 mock 数据继续出现在生产模式。

## Reset

右上角重置按钮遵循当前模式：

- production -> 重置为空 Workspace
- demo -> 重置为完整 Demo seed
