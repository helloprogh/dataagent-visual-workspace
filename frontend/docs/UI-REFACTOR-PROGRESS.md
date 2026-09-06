# UI 持续重构进度

目标：全部生成式 UI 统一 A2UI，AG-UI 保持运行及审批真源；独立迭代验证后提交并推送。

## 迭代路线

1. 恢复浏览器测试、依赖锁定、统一 CI，修复测试暴露的功能退化。
2. 状态正确性：模型隔离与失败回滚、分页竞争、审批 schema、A2UI busy、预览限流。
3. Conversation 展示层：滚动、面板、输入区、展示模型和预览数据源。
4. A2UI 统一：Catalog 契约、业务卡片、动作路由、历史兼容及回放验证。
5. 会话和产品体验：重命名、搜索、警告、主题字体、上传状态。
6. 性能基线及扩展：资源加载、长会话、Agent Runs 和文件预览能力按后端契约推进。

## 迭代 1（验证完成，准备提交）

- 将 Playwright 1.62.1 纳入 workspace 依赖和锁文件，增加 `test:e2e`、`check:ui`。
- 浏览器回归迁移到当前 Hash 路由、Element Plus X 输入及 AG-UI/A2UI 活动；独立测试端口 5187。
- CI 和重构分支验证统一执行浏览器测试，失败上传 trace/截图；去除 CI 自动修改和推送锁文件。
- 修复历史恢复骨架屏结束后未滚动至底部，以及创建会话后未记忆所选模型的问题。
- 本地可用 `PLAYWRIGHT_CHANNEL=msedge` 运行已安装 Edge；CI 默认使用 Playwright Chromium。
- 工作区 data-applications 的其他任务修改不纳入本重构提交。
- 验证：Playwright Chromium 16/16 通过（19.3 秒），本地 Edge 16/16 通过；`npm run check` 的 120 项测试、类型检查、生产构建通过；离线检查及本轮文件 diff 检查通过。
- 构建仍有既有 CSS `:deep` 和分包体积警告。浏览器使用模拟 API/SSE，本轮没有宣称完成真实 OpenCode 联调。

## 验证规则

每轮执行对应行为测试、类型检查、构建及差异检查。协议或公共运行时变化执行 Adapter 回归；记录实际测试环境，不将 mock 浏览器测试称为真实 OpenCode 联调。

Windows 本地示例：

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
$env:NO_PROXY = '127.0.0.1,localhost'
npm run test:e2e
npm run check
```

每轮只暂存明确属于本迭代的文件。推送前核对暂存差异，推送后验证远端提交。
