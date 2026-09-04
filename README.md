# Data Agent Visual Workspace 6.0

完整的 Data Agent 可视工作区工程。Vue 前端是项目主体，OpenCode2 → AG-UI Adapter 是本地联调、协议转换和会话桥接服务。

## 工程结构

```text
.
├─ frontend/   Vue 3 + Element Plus + AG-UI/A2UI 可视工作区
│  ├─ 空工作区 / Demo Mode / OpenCode2 场景模式
│  ├─ Generative UI 与 A2UI 组件注册表
│  ├─ Hash 路由 + 中英文界面国际化
│  ├─ 主 Agent 聊天与本地会话列表
│  ├─ 对话内交付卡片、右侧文件/ZIP 目录预览
│  └─ 输入框上方的标准 AG-UI 人工授权卡片
└─ adapter/    本地 OpenCode2 → AG-UI Adapter
   ├─ 默认连接参考 OpenCode `127.0.0.1:4096`（可由环境变量覆盖）
   ├─ OpenCode2 v2 `/api` 接口与本机认证
   ├─ 原生事件 → 标准 AG-UI 事件转换
   ├─ threadId → sessionID 持久化映射
   ├─ A2UI render_a2ui → 动态 MCP → AG-UI activity
   └─ mock / replay 开发入口
```

## 快速启动

要求 Node.js 20.19 或更高版本。联调必须启动参考目录
`D:\ProjectSpace\opencode-dataagent-v2` 中的 OpenCode2 service：

```powershell
cd D:\ProjectSpace\opencode-dataagent-v2
opencode2 serve --service
cd D:\ProjectSpace\dataagent
npm install
npm run dev
```

启动后：

- 前端：<http://127.0.0.1:5173>
- Adapter：<http://127.0.0.1:3001>

开发编排脚本默认把 Adapter 固定到参考服务 `http://127.0.0.1:4096`，避免误连本机其它 OpenCode。也可以通过环境变量显式覆盖地址、认证和工作区：

```powershell
$env:OPENCODE_BASE_URL = 'http://127.0.0.1:4096'
$env:OPENCODE_PASSWORD = '<your-local-opencode-password>'
$env:OPENCODE_WORKSPACE_DIRECTORY = 'D:\ProjectSpace\dataagent'
$env:NO_PROXY = '127.0.0.1,localhost'
npm run dev
```

## 三种前端模式

```bash
# 空工作区 + 真实 OpenCode2
npm run dev

# 空工作区 + 真实 OpenCode2（兼容场景入口）
npm run dev:scenario

# 隔离的静态 Demo 数据
npm run dev:demo
```

`dev` 与 `dev:scenario` 都使用真实 OpenCode2，不再注入固定工作区。浏览器只调用
`/dataagent/web/api/agui`，由 Adapter 转发到参考 OpenCode2；所有浏览器 API 都经过
`/dataagent/web/api` 前缀。前端通过标准 A2UI catalog 声明生成式 UI 能力，Adapter
把参考 OpenCode2 的原生事件和 `render_a2ui` 结果转换为 AG-UI；A2UI Delivery、
文件交付和审批都复用同一条对话流。

OpenCode2 请求工具授权时，Adapter 在同一条 SSE 中返回 `RUN_FINISHED.outcome.interrupts`。界面在输入框上方显示由后端 schema 驱动的审批卡；文件交付还可从对话卡片或右侧预览底部确认/取消，并通过同一个 AG-UI 请求携带 `RunAgentInput.resume` 恢复执行。两端都会持久化待处理 interrupt，刷新页面或重启 Adapter 后仍可继续。

## 关键入口

| 接口 | 用途 |
| --- | --- |
| `POST /dataagent/web/api/agui` | 前端默认 AG-UI SSE 入口，连接真实参考 OpenCode2 |
| `POST /dataagent/web/api/agui/file/upload` | 上传输入附件并返回同源预览地址 |
| `GET /dataagent/web/api/agui/workspace-file` | 预览工作区生成文件 |
| `GET /dataagent/web/api/agui/workspace-archive` | 获取 ZIP 目录或读取单个内部文件 |

完整接口见 [adapter/docs/UI-INTERFACES.md](adapter/docs/UI-INTERFACES.md)，事件转换见 [adapter/docs/EVENT-MAPPING.md](adapter/docs/EVENT-MAPPING.md)。技术路线见 [docs/technical-route.md](docs/technical-route.md)，对话流与交互说明见 [docs/conversation-flow.md](docs/conversation-flow.md)。

## 验证

```bash
npm test
npm run typecheck
npm run build
npm run build:scenario
npm run build:demo
```
