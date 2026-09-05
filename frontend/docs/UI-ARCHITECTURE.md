# UI 功能与重构说明

本次依据本地工作区代码梳理，未同步远程分支。前端为 Vue 3、TypeScript、Element Plus，使用 Hash 路由；浏览器通过统一 `/dataagent/web/api` 前缀访问 Adapter。

## 功能和代码职责

| 层次 | 入口 | 当前职责 |
| --- | --- | --- |
| 应用外壳 | `src/app/App.vue` | 侧栏布局、路由与当前会话同步、重命名、主题切换 |
| 会话列表 | `useSessions.ts`、`HistoryPage.vue` | 会话获取、新建草稿、选择、历史列表展示 |
| 对话界面 | `AgentChat.vue` | 输入、模型选择、消息编排、附件操作、面板切换、审批提交、快捷键、导出 |
| 会话运行状态 | `useAgentConversation.ts` | AG-UI 订阅、历史恢复与分页、流式状态、上传、发送、停止、重试、恢复审批 |
| 消息展示 | `processPresentation.ts`、`ConversationMessage.vue`、`ConversationProcessGroup.vue` | 将消息组织成正文和执行过程，展示推理、工具调用与结果 |
| 交付与审计派生 | `useConversationArtifacts.ts` | 聚合消息附件、生成式文件卡、工具生成文件；处理删除、版本编号、审批关联和预览同步；派生审计记录 |
| 文件预览 | `FilePreviewPanel.vue` | Markdown、图片、PDF、文本、ZIP 目录及内部文件预览，文件审批入口 |
| 人工审批 | `InterruptCard.vue`、`approval.ts` | 根据 responseSchema 展示表单，生成确认/取消的恢复参数 |
| 生成式 UI | `src/a2ui/`、`GenerativeUiCard.vue` | A2UI catalog、surface 生命周期、图表和结构化卡片 |
| 模型 | `ModelSelector.vue`、`features/model/api/model.ts` | 读取默认/会话模型，用户切换时持久化模型选择 |
| 技能 | `SkillPage.vue` | 搜索、刷新、ZIP 上传和删除确认 |
| 工具 | `ToolPage.vue` | 基于模型读取能力目录，展示工具/MCP 状态、统计、搜索和警告 |
| 共享基础 | `shared/api`、`shared/styles`、`i18n` | 请求封装、主题 token、公共布局、中英文文案 |

## 已实施重构

### 聊天界面的派生数据独立管理

将原来嵌入 AgentChat 的交付聚合、预览同步和审计计算迁移到 `useConversationArtifacts`。组件继续负责用户操作与界面编排，组合函数消费响应式 messages、pendingInterrupts、attachments 和 activePreview，不另建会话状态副本。

保留以下既有语义：仅成功工具结果产生交付文件；删除工具结果移除对应路径；同名输出按顺序编号；单一 form 可以关联最新交付；审批晚于文件到达时更新已打开预览；多审批仍由聊天层聚合提交。

### 列表异步加载复用

新增 `shared/composables/useAsyncResource.ts`，由工具页、技能页复用。每次刷新获得递增请求编号，只允许最新请求发布数据、错误和 loading 状态；作用域销毁后忽略迟到响应，也不会继续启动请求。

两页保留各自的失败策略：工具目录失败时清空列表及警告；技能列表失败时保留已加载内容。上传、删除和确认弹窗仍归技能页管理。请求编号用于防止界面被旧结果覆盖，并不取消底层网络请求。

模板、CSS、API 地址及 AG-UI 协议没有调整。

## 后续可独立处理的部分

- AgentChat 的滚动跟随、历史分页位置恢复可以继续提取为组合函数，需覆盖切换会话期间分页返回的交互。
- FilePreviewPanel 同时管理普通文件和 ZIP 内部文件请求，可按预览数据源继续拆分，保留现有 AbortController。
- ModelSelector 切换失败后没有恢复下拉框的原选择；加载期间会话变化被 watcher 跳过。建议独立补充会话切换/失败恢复测试后修正。
- 消息和生成式内容边界仍有较多 `any`，后续可在协议归一化层收窄类型，避免在模板层重复猜测数据形态。
- 构建仍报告较大 JS 分包以及 CSS `:deep` 警告；当前重构未涉及依赖样式或打包策略。

## 验证方式

- `npm run typecheck`：Vue/TypeScript 静态检查。
- `npm test`：现有协议、审批、交付和 UI 契约回归，以及新增的异步资源行为测试。
- `npm run build`：Adapter 语法检查和前端生产构建。
- 浏览器回归位于 `frontend/e2e`；当前本地没有 `@playwright/test`，本次未运行这些用例，也未验证真实 OpenCode 服务交互。

异步资源测试覆盖旧请求晚到、旧请求失败时当前请求仍保持 loading、当前请求失败的两种数据保留策略，以及页面卸载后的响应处理。现有 UI 源码契约测试已改为检查新的职责边界。
