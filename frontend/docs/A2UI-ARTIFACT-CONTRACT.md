# A2UI 文件数据契约

`render_a2ui` 使用独立 `artifacts` 表，`ArtifactCard` 只引用表内 ID：

```json
{
  "surfaceId": "report",
  "components": [{ "id": "root", "component": "ArtifactCard", "artifactId": "report-file" }],
  "artifacts": [{
    "id": "report-file", "name": "report.txt", "mimeType": "text/plain",
    "url": "/dataagent/web/api/agui/workspace-file?path=report.txt"
  }]
}
```

- ID 为 1–64 位字母、数字、下划线或连字符，表内不得重复；组件引用必须存在。
- 最多 100 条，序列化长度不超过 65536；name 最长 200 字符，mimeType 最长 120。
- URL 仅允许既有本地文件 API 路径，拒绝外部地址、可执行 scheme 和目录穿越。文件存在性及实际读取权限仍由文件 API 校验。
- 输入经共享规范化后写入 activity.content.artifacts。Surface 更新是完整快照；省略 artifacts 表示清空，空 components 删除 Surface 及其文件表。
- 前端按完整快照重建模型，省略的数据字段和组件不继承旧值；同一消息的完全相同操作不重复重建。需要保留的字段值必须由生产端包含在下次快照中。
- 操作顺序保持不变。模型更换后组件重新订阅；旧模型发起的异步动作不能覆盖新模型的错误或忙碌状态。
- 前端以消息 ID 和 artifact ID 组合生成交付域 ID，防止同一会话不同 Surface 的文件 ID 冲突；渲染组件仍使用原表内引用。
- 文件数据不能声明 approvalInterruptId 或 approvalResolved，这些字段不会进入规范化快照。原生 A2UI 文件不推断审批关联，真实审批保留在 AG-UI 表单中。
- 旧历史及工具输出文件继续通过应用可信交付数据保留既有审批关联，不改变原始历史内容。

本地预览事件不会创建 Agent Run；Agent 动作与审批恢复分别使用原有入口。当前自动化验证覆盖生产端快照、恢复、更新、删除及模拟 API 浏览器回放，不代表真实 OpenCode 服务联调完成。
