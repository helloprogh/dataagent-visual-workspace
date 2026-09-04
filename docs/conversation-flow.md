# 对话流与人机交互说明

## 运行主链路

```text
打开会话
  ├─ 拉取历史消息
  ├─ 创建 AG-UI client 并绑定事件
  └─ 以 hydrate run 恢复服务端待处理中断

提交需求
  ├─ 校验：未运行、无待审批、文本或附件非空
  ├─ 上传附件并发布用户消息
  └─ 启动带 A2UI 能力声明的 run
       ├─ reasoning/text/tool 事件 → 更新消息与响应阶段
       ├─ activity snapshot/delta → 对话内生成式 UI
       └─ RUN_FINISHED(interrupt) → 等待用户决定

恢复审批
  ├─ 校验本次必须覆盖当前 Run 的全部 interrupt，拒绝重复或缺失项
  ├─ 清空本地待审批队列并提交 resume
  ├─ 清空 AG-UI client 的旧 interrupt 队列
  └─ 重新拉取历史，确保工具结果与服务端状态一致
```

所有主动运行（提交、恢复、重试、A2UI action）都经过同一个运行生命周期：开始时清理旧错误并设置 `running`，失败时设置统一错误并按需回滚，结束时无条件复位 `running`。这样按钮禁用、加载态、恢复条和流式消息不会由四套略有差异的逻辑分别维护。

## 状态与交互不变量

| 状态 | 用户可做的事 | 不允许的事 |
| --- | --- | --- |
| 水合中 | 查看骨架屏 | 提交新消息或修改审批 |
| 运行中 | 查看流式 reasoning、正文和工具过程；可停止 | 重复提交、选择附件、提交审批 |
| 单个待审批 | 点击文件卡或右侧预览底部的快捷确认/取消；也可展开完整表单 | 绕过 `responseSchema` 自造 payload |
| 多个待审批 | 在汇总审批卡一次完成全部中断 | 只提交其中一个中断 |
| 可恢复错误 | 查看错误原因并重试 | 把失败当成已完成交付 |
| A2UI 已生成 | 展开、折叠和触发普通 action | 用 A2UI action 代替文件审批 |

单个文件审批的两个入口（对话内文件卡、右侧预览面板）共享同一 `ResumeEntry` 构造逻辑。多中断时底部汇总卡必须保留，因为服务端 resume 接口要求一次覆盖同一 Run 的全部中断；否则文件卡虽可见却无法单独提交，会形成死路。

原生审批同时是阶段状态的硬门禁。审批前的产物只能标记为待审批或待发布，确认后才更新 canonical 状态并宣布阶段通过或正式发布；取消后必须停止，不能补写完成状态。Adapter 将这条约束作为可信运行上下文传给参考 OpenCode，避免模型在发起表单前提前写入“已发布”。

对于 `dataagent-master` 的 Data Application，阶段顺序固定为
`Specification → Solution Design → Development → Validation → Release`。前端只消费父
Run 发出的产物和原生 form，不把子 Agent 完成当成阶段完成；因此标准三道门禁或演示要求的
五道门禁都能沿用同一套审批恢复流程。

右上角“交付物”只统计真实输入/输出文件，不把待审批中断计数。审批状态由文件的 `approvalInterruptId` 与当前 pending interrupt 集合关联；A2UI 只负责非阻塞展示和普通交互，不拥有审批权限。

## 代码职责

- `useAgentConversation.ts`：会话、AG-UI 事件、运行生命周期、审批恢复和历史水合；不负责视觉布局。
- `processPresentation.ts`：把原始消息投影成 turn/process/message，只负责展示分组，不修改原消息。
- `AgentChat.vue`：组合布局、滚动、面板开关和用户动作路由。
- `InterruptCard.vue`：把后端 `responseSchema` 映射成一次性审批视图模型，负责表单校验和 `ResumeEntry` 输出。
- `FilePreviewPanel.vue` / `GeneratedArtifactCard.vue`：文件预览与交付审批入口，不直接访问后端审批接口。

## 本轮整理

1. 提交、恢复、重试、A2UI action 共用 `runWithState`，移除重复的运行状态切换和错误转换。
2. 恢复审批拒绝重复 entry，避免同一个中断被提交两次。
3. 中断卡先生成 `interruptViews`，模板不再反复解析 schema、字段和选项。
4. 错误通知增加同步去重，避免流事件错误与 Promise rejection 同时弹出两次。
5. 保留单审批文件卡快捷入口、多审批汇总入口的交互边界，避免审批队列被隐藏后无法继续。
6. 活动右侧预览随交付物绑定更新，覆盖“文件先到、审批表后到”的流式竞态。
7. A2UI 删除快照即使单独到达也会保留，避免已关闭 surface 在刷新后变成空卡片。
8. shell/bash 成功创建或校验的显式 ZIP 路径会投影成归档交付卡，结构化压缩包不会再被折叠进执行过程。
