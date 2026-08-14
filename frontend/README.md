# Data Agent Visual Workspace V5.2

Vue 3 + Vite + Element Plus + CopilotKit Vue v2 + AG-UI 的视觉优先 Data Agent Demo。


## Empty Workspace / Demo Mode

V5.2 默认不再向新线程注入任何整屏 mock 数据。

### 生产 / 默认模式

```bash
npm run dev
```

或在 `.env` 中显式设置：

```env
VITE_DEMO_MODE=false
```

新建 thread 时左侧 Workspace 为空，仅展示引导态。KPI、趋势、洞察、SQL、子 Agent 拓扑等必须由真实 Agent 通过 `workspace.render`、`workspace.upsert`、`workspace.agents` 动态生成。

### Demo Mode

```bash
npm run dev:demo
```

`--mode demo` 会加载项目内 `.env.demo`：

```env
VITE_DEMO_MODE=true
```

此模式才会给新 thread 注入完整的经营分析示例数据，方便演示 UI 组件与多 Agent 编排。

### 模式隔离

Demo 与生产模式使用不同的 Workspace localStorage key：

```text
dataagent.workspace.v3.demo
dataagent.workspace.v3.prod
```

因此先运行 Demo Mode 再切回生产模式，也不会把示例 KPI / 图表 / 子 Agent 数据带入生产工作区。旧 V2 mock seed 的 storage key 也不会继续读取。


## 产品形态

- 左侧约 75%：Data Intelligence Workspace，生成式 UI 主画布
- 右侧约 25%：Data Agent Copilot，对话只承担控制、追问与解释
- 历史对话：在右侧面板内部切换，不挤占主工作区
- 每个 thread 独立保存聊天历史、Agent state 和 Workspace 布局
- 不创建 OpenCode2 session
- 不依赖 CopilotRuntime
- 使用 selfManagedAgents + HttpAgent 直连标准 AG-UI 后端

## 模型控制主工作区

V5 提供 4 个真正的浏览器侧 Frontend Tools：

- `workspace.render`：整体重构主工作区
- `workspace.upsert`：新增或更新一个视觉模块
- `workspace.remove`：移除一个视觉模块
- `workspace.agents`：一次刷新子 Agent 编排拓扑、并行时间线和实时活动流

这些工具通过 `useFrontendTool()` 注册。模型调用后，handler 会直接修改左侧 Workspace，而不是把生成式 UI 堆叠在聊天消息中。

### 可用 UI 模块

- `ui.agentGraph` 多 Agent 编排拓扑
- `ui.agentTimeline` 子 Agent 并行执行时间线
- `ui.agentActivity` 子 Agent 实时活动流
- `ui.executiveSummary` AI 摘要
- `ui.metric` 单指标
- `ui.kpis` KPI 驾驶舱
- `ui.lineChart` 趋势
- `ui.barChart` 分类对比
- `ui.donutChart` 构成占比
- `ui.funnel` 转化漏斗
- `ui.heatmap` 热力分析
- `ui.rootCause` 智能归因
- `ui.forecast` 趋势预测
- `ui.insights` 洞察
- `ui.analysisPlan` 分析计划
- `ui.queryTrace` Agent 执行链路
- `ui.sql` SQL
- `ui.dataQuality` 数据质量
- `ui.fieldProfile` 字段画像
- `ui.semanticModel` 语义模型
- `ui.table` 查询结果

## 推荐 Agent 指令

建议在 Data Agent system prompt 中加入：

```text
你是一个视觉优先的 Data Agent。

用户的主要工作区在聊天面板左侧。聊天用于沟通，结构化分析结果应优先组织到主工作区。

当用户要求经营分析、趋势分析、异常分析、归因、预测、数据质量、SQL 或语义分析时：
1. 优先调用 workspace.render 组织完整分析界面；
2. 后续追问只改变局部模块时使用 workspace.upsert；
3. 不再需要的模块使用 workspace.remove；
4. 同一工作区使用稳定 widget id，方便后续更新；
5. 12 列布局中建议 KPI/摘要占 12 列，主图 7~8 列，洞察/质量 4~5 列；
6. 当任务拆给多个子 Agent 时，调用 workspace.agents 展示编排、进度和活动；
7. 纯文本只用于简短解释，不要用 Markdown 模拟图表。
```

## V5 视觉方向

V5 使用 Obsidian / Titanium Intelligence 视觉系统：深灰雾面底、钛金属边界、低饱和冷白文本，以及青蓝 / 紫罗兰 / 玫瑰色的受控光谱点缀。彩色只用于 AI 活动、运行状态与关键数据变化，减少大面积蓝青色造成的“开发者 Demo 感”。

子 Agent 事件建议见 `docs/subagent-visualization.md`。

## 演示问题

推荐直接输入：

> 帮我构建一个本月经营驾驶舱：展示 GMV、订单量、客单价、活跃用户和退款率，分析最近 30 天趋势，定位增长主要驱动因素，并给出 3 条风险洞察。请直接更新左侧分析工作区。

然后追问：

> 把趋势区域改成渠道对比和渠道占比，其他模块保持不变。

再追问：

> 增加一个数据质量模块和最近一次查询的 SQL 执行链路。

## 启动

```bash
npm install
npm run dev
```

`.env` 示例：

```env
VITE_AGUI_URL=/api/agui
VITE_AGUI_PROXY_TARGET=http://localhost:3001
VITE_AGENT_ID=data-agent
VITE_AGENT_DISPLAY_NAME=Data Agent
VITE_AGUI_TOKEN=
VITE_DEMO_MODE=false
```

如果后端已配置 CORS，也可以直连：

```env
VITE_AGUI_URL=http://localhost:3001/agent
```

## 说明

Workspace 当前默认使用 localStorage 持久化。生产模式的新 thread 是空工作区；Demo Mode 才会注入示例数据。生产环境可将 ConversationRepository 与 Workspace persistence 替换为服务端存储，聊天和视觉组件无需重写。

## npm 安装稳定性

本版本已将核心依赖从 `latest` 改为明确版本，并固定 `zod@3.25.76` 与当前 CopilotKit Vue 的 Zod 3 依赖体系保持一致。项目根目录 `.npmrc` 增加了网络重试和超时配置，但不会强制覆盖你本机的 registry 或代理。

推荐 Node.js 22.12+。先检查：

```bash
node -v
npm -v
npm config get registry
npm ping
```

正常安装：

```bash
npm install
```

如果公司网络无法直接访问 npm 官方源，请配置你们内部 npm registry；不要在项目源码中写死公司代理地址。临时验证公开镜像可用性时，可自行使用 `npm install --registry=<你的可用registry>`。

如果仍超时，用：

```bash
npm install --verbose
```

看最后停在哪个 registry URL/包上，通常即可区分 DNS、代理、TLS/证书或某个 registry 不可达。

## 离线预览与校验

无需安装依赖也可以直接打开：
- `preview/index.html`：默认生产模式的空工作区
- `preview/demo.html`：Demo Mode 完整示例
- `preview/demo-workspace.png` / `preview/demo-history.png`：上一轮 Demo Mode 的 Chromium 截图

正式 Vue 工程的模式由 `VITE_DEMO_MODE` 控制；静态 preview 仅用于快速查看视觉方向。

```bash
npm run check:offline
npm run diagnose:npm
```

完整校验说明见 `docs/BUILD-VERIFICATION.md`。

## V5.1 可读性优化

- 提升辅助文字最小字号，子 Agent / Timeline / Activity 不再使用 6px 级文字。
- 次级文字灰阶整体提亮，正文/标签/图表轴标签对比度提高。
- 降低网格、环境光和玻璃层竞争，减少“高端但发灰”的问题。
- 右侧 Data Agent 对话正文与输入区域提升字号和边界对比。
