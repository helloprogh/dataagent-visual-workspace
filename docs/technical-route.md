# DataAgent 生成式 UI 对接技术路线说明

> 文档版本：2026-09-05
>
> 适用范围：`dataagent-master` 生成式 UI 对接、AG-UI 流式对话、文件交付审批与验收场景。

## 1. 目标与边界

本项目的目标是让现有 Vue 对话界面兼容 `dataagent-master` 的生成式 UI 能力，并保持当前产品的对话、文件预览和人机审批体验。

本次路线只覆盖生成式 UI 和其必要的交互闭环，不把所有 OpenCode API 搬到前端，也不改变参考 OpenCode 的会话、模型、工具和权限语义。前端只依赖 Adapter 暴露的稳定 AG-UI 契约；Adapter 负责把参考 OpenCode 的原生事件转换为 AG-UI 事件。

## 2. 总体架构

```text
dataagent-master / 模型
          │
          │  OpenCode 原生 session / event / tool / form
          ▼
参考 OpenCode（opencode-dataagent-v2，当前联调端口 4096）
          │
          │  OpenCodeClient
          ▼
Node Adapter（当前联调端口 3001）
  ├─ 原生事件 → AG-UI TEXT / REASONING / TOOL / STEP / RUN
  ├─ render_a2ui → a2ui-surface activity
  ├─ form / permission → RUN_FINISHED(interrupt)
  ├─ 会话历史、审批状态、UI snapshot 持久化
  └─ workspace-file / workspace-archive 只读预览路由
          │
          │  SSE + REST（同源 /dataagent/web/api）
          ▼
Vue 前端
  ├─ useAgentConversation：运行状态和事件绑定
  ├─ processPresentation：消息 → 对话轮次/执行过程投影
  ├─ A2UI runtime：白名单组件渲染和普通 action
  ├─ FilePreviewPanel：文件、Markdown、PDF、ZIP 目录/文件预览
  └─ InterruptCard：responseSchema → ResumeEntry
```

生产联调必须启动参考目录中的 OpenCode，不使用本机其它 OpenCode 实例：

```text
OPENCODE_BASE_URL=http://127.0.0.1:4096
OPENCODE_WORKSPACE_DIRECTORY=D:\ProjectSpace\dataagent
```

本地回环请求需要设置 `NO_PROXY=127.0.0.1,localhost`，否则 MCP/A2UI 请求可能被系统代理转发，导致 `render_a2ui` 能力显示失败。

## 3. 会话与对话流

### 3.1 打开会话

`useAgentConversation.open` 执行以下顺序：

1. 增加 generation，取消上一会话的订阅和 hydration run。
2. 请求 `/session/{id}/message`，按 OpenCode V2 `{ data, cursor }` 解析历史。
3. 创建 AG-UI `HttpAgent`，注入历史消息并绑定事件订阅。
4. 通过同一 `/agui?mode=hydrate` 入口恢复 Adapter 持久化的 pending interrupts。
5. 只有 generation 仍然有效时，才把结果写回当前页面，避免快速切换会话造成串流覆盖。

### 3.2 新消息

提交前必须满足：当前不在 hydration、不在运行、没有待审批中断，并且文本或附件至少存在一项。

提交顺序是“先确认本地提交，再开始慢流”：

1. 创建或复用 session。
2. 附件上传到 Adapter，获得同源预览地址。
3. 把用户文本和附件组成一个 AG-UI user message。
4. `publishAndRun` 立即写入消息、清理已提交草稿并通知会话列表更新。
5. 以 `A2UI_RUN_CAPABILITY` 启动 run，声明 catalog、A2UI 可用性和上下文。

草稿清理发生在 run 开始前，因此网络流较慢时不会让用户误以为提交失败；如果发布前失败，草稿仍然保留。

### 3.3 事件归一化

Adapter 将参考 OpenCode 的原生事件映射到稳定的 AG-UI 生命周期：

| 原生信息 | AG-UI 事件 | 前端行为 |
| --- | --- | --- |
| reasoning started/content/finished | `REASONING_MESSAGE_*` | 显示思考阶段和耗时 |
| assistant text delta | `TEXT_MESSAGE_*` | 增量渲染正文，跟随滚动 |
| tool call/input/result | `TOOL_CALL_*`、tool message | 执行过程折叠展示，结果回填原工具行 |
| task/sub-agent | `STEP_*`、activity | 显示过程节点，不复制重复工具行 |
| `form.created` / permission | `RUN_FINISHED` + interrupt outcome | 阻塞在审批，不继续发送新输入 |
| execution error | `RUN_ERROR` | 显示可恢复错误条，允许重试 |

前端 `responsePhase` 只表达当前视觉阶段（waiting/thinking/responding/working），不作为业务完成判据。完成判据来自 AG-UI run 事件和历史结果。

## 4. 生成式 UI 路线

### 4.1 A2UI

参考 OpenCode 通过 `render_a2ui` 生成 A2UI v0.9 操作序列。Adapter 做两层校验：

- MCP 层：校验 catalog、版本、组件白名单、surfaceId、引用完整性、深度和 payload 大小。
- AG-UI 层：将操作序列封装为 `a2ui-surface` activity snapshot，按 surfaceId 在同一会话中复用消息身份。

前端 `NativeA2uiSurface` 只注册白名单组件，不执行模型提供的 HTML、JavaScript、Vue 模板或任意脚本。普通 Action 通过新的 AG-UI run，以 `forwardedProps.a2uiAction` 原样回传；A2UI 不拥有审批权限。

历史快照通过 `/session/{id}/message` 的 `activities` 字段按 `parentMessageId` 归位。删除 surface 仍保留终态，避免刷新后旧卡片复活。

### 4.2 原有 `dataagent.ui`

现有应用卡片继续支持 snapshot/delta，Adapter 对内容执行严格规范化：最多 12 张卡、64 KB JSON、有限指标/表格规模、同源文件地址。普通模型正文不会被猜测成 UI，只有明确结构化工具输出才生成卡片。

两套 activity 都在对话回答区域展示，不进入折叠的 reasoning/tool 过程；折叠过程只负责过程证据，UI 卡负责结果或交互。

## 5. 文件交付、审批与恢复

### 5.1 文件身份

文件来源分为三类：

- 用户输入附件：上传后由 Adapter 生成 UUID 文件路由。
- 应用 UI file card：使用已校验的同源 `/agui/file/{uuid}` 地址。
- 工作区生成文件：成功的 `write` 工具结果投影成 file card，使用 `/agui/workspace-file?path=...`；成功的 shell/bash 归档创建或校验结果会把显式 ZIP 路径投影成 archive card，使用 `/agui/workspace-archive?path=...`。两类路径都严格限制在 workspace 内，路由仍会校验文件真实存在。

右上角交付物计数只统计这些文件，不统计 pending interrupt。

### 5.2 单审批

当一个 ready file card 声明 `approvalMode: next-interrupt` 时，Adapter 在收到唯一的后续表单后写入真实 `approvalInterruptId`。前端提供两个等价入口：

- 对话内生成文件卡下方的“确认并继续/取消”。
- 点击文件卡后的右侧预览底部的“确认并继续/取消”。

两个入口都使用 `approval.ts` 生成相同的 `ResumeEntry`。简单的单字段 enum/oneOf/boolean 表单可以快捷确认；多字段、自由文本或复杂 schema 只能展开完整 `InterruptCard`。

### 5.3 多审批

服务端要求同一个 Run 的全部 pending interrupts 一次性 resume。因而交互边界必须保持：

- 只有一个待审批中断：文件卡可以承接快捷动作，底部通用卡隐藏重复项。
- 有多个待审批中断：底部汇总卡保留全部中断，用户一次完成全部决定；文件卡快捷按钮提示进入完整审批，不发出部分 resume。

恢复前校验 entry 数量、ID 集合和 pending 集合完全一致，并拒绝重复 ID。提交时先清空本地队列；失败则恢复本地和 AG-UI client 快照；成功后重新拉取历史，修复原生工具在暂停前后产生的关联差异。

## 6. 结构化 ZIP 产物与预览

数据开发阶段的最终产物必须是一个结构化 ZIP，而不是一段说明文字。为了与
`dataagent-master` 的 Data Application 契约保持一致，压缩包内部应保留应用根目录和五阶段目录：

```text
data-development-delivery.zip
└─ data-applications/demo-sales/
   ├─ source-manifest.json
   ├─ 01-specification/
   │  └─ analysis-spec.json
   ├─ 02-design/
   │  ├─ data-application-design.md
   │  ├─ data-dictionary.md
   │  ├─ schema.json
   │  ├─ quality-rules.json
   │  └─ design-approval.json
   ├─ 03-development/
   │  ├─ execution-plan.json
   │  ├─ transform.sql
   │  ├─ metric-contract.json
   │  ├─ governance-policy.json
   │  └─ outputs/
   ├─ 04-validation/
   │  ├─ execution-evidence.json
   │  ├─ validation-report.md
   │  └─ release-approval.json
   └─ 05-release/v1/
      ├─ README.md
      └─ manifest.json
```

其中 `01-specification`、`02-design`、`03-development`、`04-validation` 和
`05-release` 分别对应 Specification、Solution Design、Development、Validation
和 Release。ZIP 是前端演示用的聚合交付物；真实后端仍以这些相对路径下的 canonical
文件和审批事实为准，不能只凭 ZIP 文件名推断阶段已完成。

Adapter 的 `workspace-archive` 路由提供两个只读能力：

1. 不带 `entry`：解析 ZIP 中央目录，返回文件/目录、路径和大小。
2. 带 `entry`：只读取已列出的文件项，支持 stored/deflate 两种算法。

解析限制：压缩包最多 50 MB、最多 2000 项、单文件预览最多 10 MB；拒绝绝对路径、`..` 路径、加密项、ZIP64 和未知压缩算法。前端右侧面板补齐隐含目录，左侧显示完整树，右侧按文件类型预览 Markdown、文本、图片和 PDF，其他类型可在新窗口下载。

## 7. 五步验收场景

输入一段同时包含以下五步的完整需求描述，应用标识固定为 `demo-sales`：

验收时可直接粘贴下面这段需求，确保真实后端收到的是一个完整请求，而不是五次互相
无关的测试输入：

```text
请演示一次完整的数据开发交付，应用标识为 demo-sales。严格按
Specification → Solution Design → Development → Validation → Release 五个阶段顺序执行。
每个阶段先生成并展示本阶段产物，再发起一个原生审批表单；表单提供“确认并继续”和“取消”，
只有我确认后才能进入下一阶段，取消则停止且不能伪造完成状态。产物可以使用 mock 数据，但必须
通过同一条 AG-UI 对话流和文件交付卡片呈现。Development 阶段必须生成
data-development-delivery.zip，压缩包内包含 data-applications/demo-sales/ 下完整的五阶段目录、
目录结构和可读文件；点击文件卡后，右侧预览要能查看 ZIP 的完整目录并打开至少一个 Markdown、
JSON 或 SQL 文件。每个产物都要能从对话卡片打开预览；审批既能在卡片下方操作，也能在右侧预览
底部操作。最后生成 05-release/v1/README.md 和 manifest.json，并明确展示“已发布”。不要把审批
结果写成普通文本，不要跳过任何阶段，不要在前端硬编码完成状态。
```

1. Specification：生成 `data-applications/demo-sales/01-specification/analysis-spec.json`，展示并审批后继续。
2. Solution Design：生成 `02-design` 设计 bundle，展示并审批后继续。
3. Development：生成 `03-development` 开发 bundle，并打包成结构化 `data-development-delivery.zip`；ZIP 可展开完整目录、预览内部文件，审批后继续。
4. Validation：生成 `04-validation/execution-evidence.json` 和 `validation-report.md`，展示验证结果并审批后继续。
5. Release：生成 `05-release/v1/README.md` 与 `manifest.json`，展示最终交付并发布。

每一步验收检查：

- 对话中是否出现对应产物卡片。
- 点击卡片是否打开右侧预览，关闭后是否保持对话位置。
- 单审批是否能从卡片和右侧底部继续/取消。
- 多审批是否回退到完整汇总卡且不会出现部分提交死路。
- 通过后是否进入下一步，历史刷新后状态和产物是否保持。
- 运行失败是否只显示可恢复错误，不伪造“已完成”。
- 最终 ZIP 是否能查看完整目录、文本内容和下载链接。

`dataagent-master` 的标准 Olist 工作流默认在 Specification、Design 和 Release 设置原生
审批门禁，Development/Validation 由工作流守卫和独立验证自动推进。若本次演示要求五个
阶段都显式确认，必须在输入中明确要求父 Run 在每个阶段产物展示后发起一个原生 form；前端
不假设审批数量，收到 `RUN_FINISHED(interrupt)` 即显示对应审批入口。

允许使用 mock 产物，但 mock 必须走同一 AG-UI activity、文件卡、审批和预览路径，不得在前端直接写死“已完成”状态。

## 8. 失败处理与可观测性

- 连接失败：显示“本次生成未完成”和原始错误，保留重试按钮。
- Body stream 中止：结束当前 run，保留已收到的消息和产物，不自动标记后续阶段完成。
- A2UI 不可用：只降级为文本/标准文件卡，不阻断文件审批闭环。
- ZIP 损坏或超限：右侧显示明确原因，同时保留原文件下载入口。
- 历史恢复失败：不恢复过期审批决定，优先保留服务端已接受的结果。

验收期间重点观察：runId/threadId 是否一致、RUN_FINISHED outcome 是否存在、pending interrupt 数量、activity parentMessageId、workspace archive HTTP 状态以及 resume payload 的 ID 集合。

## 9. 验证命令

```text
npm run check
npm run check:offline -w frontend
```

其中 `npm run check` 包含 Adapter 全量测试、前端类型检查、Adapter 语法检查和 Vite 生产构建。联调时仍需确认 Adapter 的 `OPENCODE_BASE_URL` 指向参考目录中的 OpenCode 服务。
