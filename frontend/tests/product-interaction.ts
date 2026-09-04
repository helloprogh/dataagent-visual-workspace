// Dev-only integration harness. All API requests are intercepted: no model run,
// workspace write, permission change, or real approval can leave this page.
import { createApp, h, ref } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import 'x-markdown-vue/style'
import AgentChat from '../src/features/conversation/components/AgentChat.vue'
import { i18n } from '../src/i18n'
import { initializeTheme } from '../src/shared/theme/theme'
import '../src/shared/styles/index.css'

const storageKey = 'dataagent.test.interaction.v1'
const state = ref(JSON.parse(sessionStorage.getItem(storageKey) ?? '{"decision":"pending","submissions":0}'))
const doc = '# 交互验收 Spec\n\n状态：待审批\n\n- 卡片与预览均可审批。\n- 取消后不得继续执行。\n\n```sql\nSELECT revenue / orders AS average_order_value FROM sales;\n```'
const interrupt = { id: 'fixture-approval', reason: 'human_input', message: '请审核此测试文档', metadata: { kind: 'form' }, responseSchema: { type: 'object', properties: { decision: { type: 'string', enum: ['确认并继续', '取消'] } }, required: ['decision'], additionalProperties: false } }
const model = { providerID: 'isolated', id: 'test', name: '隔离测试 · 无模型调用', enabled: true }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const history = () => [
  ...(state.value.decision !== 'pending' ? [{ id: 'result', type: 'assistant', content: [{ type: 'text', text: state.value.decision === 'resolved' ? '审批已通过，继续执行完成。' : '已取消，流程停止。' }] }] : []),
  { id: 'artifact', type: 'assistant', content: [{ type: 'text', text: '验收文档已生成，请预览后审批。' }, { type: 'tool', id: 'write-spec', name: 'write', state: { status: 'completed', input: { path: 'ui-polish-review.md', content: doc }, result: 'Saved' } }] },
  { id: 'request', type: 'user', text: '隔离交互测试：生成 Spec → 预览 → 确认或取消 → 恢复会话。' },
]

window.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin)
  if (url.pathname.endsWith('/model/default')) return json({ data: model })
  if (url.pathname.endsWith('/model')) return json({ data: [model] })
  if (url.pathname.endsWith('/message')) return json({ data: history(), cursor: {} })
  if (url.pathname.endsWith('/workspace-file')) return new Response(doc, { headers: { 'Content-Type': 'text/markdown' } })
  if (url.pathname.endsWith('/agui')) {
    const body = JSON.parse(String(init?.body ?? '{}'))
    if (url.searchParams.get('mode') !== 'hydrate') {
      const entries = body.resume
      if (!Array.isArray(entries) || entries.length !== 1 || entries[0].interruptId !== interrupt.id || state.value.decision !== 'pending') return json({ error: 'Invalid or duplicate resume' }, 409)
      const entry = entries[0]
      if (!['resolved', 'cancelled'].includes(entry.status) || (entry.status === 'resolved' && entry.payload?.decision !== '确认并继续')) return json({ error: 'Unexpected approval payload' }, 400)
      state.value = { decision: entry.status, submissions: state.value.submissions + 1, receipt: entry }
      sessionStorage.setItem(storageKey, JSON.stringify(state.value))
    }
    const identity = { threadId: body.threadId, runId: body.runId }
    const events = [
      { type: 'RUN_STARTED', ...identity },
      { type: 'STATE_SNAPSHOT', snapshot: {} },
      { type: 'RUN_FINISHED', ...identity, outcome: state.value.decision === 'pending' ? { type: 'interrupt', interrupts: [interrupt] } : { type: 'success' } },
    ]
    return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } })
  }
  return json({ error: `Isolated test blocked request: ${url.pathname}` }, 403)
}

initializeTheme()
createApp({
  setup() {
    return () => h('div', { class: 'dataagent-app', style: 'height:100%;display:grid;grid-template-rows:auto minmax(0,1fr)' }, [
      h('div', { style: 'display:flex;flex-wrap:wrap;gap:1rem;padding:0.75rem;border-bottom:1px solid var(--da-border)' }, [
        h('b', '隔离交互测试 · 无真实后端操作'),
        h('button', { onClick: () => { sessionStorage.removeItem(storageKey); location.reload() } }, '重置测试'),
        h('output', { 'aria-label': '审批请求回执' }, JSON.stringify(state.value)),
      ]),
      h(AgentChat, { sessionId: 'isolated-interaction', displayName: 'Spec 审批交互回归' }),
    ])
  },
}).use(ElementPlus).use(i18n).mount('#app')
