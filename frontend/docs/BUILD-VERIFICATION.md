# 构建验证记录

## 依赖基线

当前前端使用 Vue 3、Element Plus、`@ag-ui/client`、A2UI Web Core、Vue I18n、Vue Router 和 Vite 8；
不再依赖 CopilotKit runtime。路由使用 `createWebHashHistory`，界面文案由 `vue-i18n` 管理。

## 已完成检查

- `npm test -w adapter`：112 个测试通过，覆盖 AG-UI 事件、原生 HITL、A2UI 校验、工作区文件和 ZIP 预览。
- `npm run typecheck -w frontend`：Vue/TypeScript 类型检查通过。
- `npm run build -w adapter`：所有 Adapter 模块语法检查通过。
- `npm run build -w frontend`：Vite 生产构建通过。
- `npm run check:offline -w frontend`：53 个源文件和依赖声明检查通过。
- `git diff --check`：无实际格式错误。

## 已知构建提示

- `x-markdown-vue` 依赖的样式仍会触发 lightningcss 对旧式 `:deep` 选择器的提示；不影响构建结果。
- ECharts/Markdown 依赖使部分产物超过 500 KB，后续可通过动态导入做代码分割；不影响当前功能验收。

## 联调前置条件

真实验收时必须启动 `D:\ProjectSpace\opencode-dataagent-v2` 中的参考 OpenCode2，
并将 Adapter 指向 `http://127.0.0.1:4096`。本地回环请求设置
`NO_PROXY=127.0.0.1,localhost`，避免 A2UI MCP 请求被系统代理转发。
