<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { HttpAgent, type Message } from '@ag-ui/client'
import ConversationMessage from '../src/features/conversation/components/ConversationMessage.vue'
import ConversationProcessGroup from '../src/features/conversation/components/ConversationProcessGroup.vue'
import { buildPresentation } from '../src/features/conversation/processPresentation'

const messages = ref<Message[]>([])
const busy = ref(false)
const narrow = ref(false)
const previewed = ref('')
const a2uiAction = ref('')
let controller: ReadableStreamDefaultController<Uint8Array> | undefined
let answerSent = false
let resolveStreamReady: (() => void) | undefined
let streamReady = new Promise<void>(resolve => { resolveStreamReady = resolve })
const messageId = 'ui-fixture-sales'
const send = (event: unknown) => controller?.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`))
const presentation = computed(() => buildPresentation(messages.value, busy.value))
const agent = new HttpAgent({ threadId: 'fixture', url: 'http://fixture.local', fetch: async () => new Response(new ReadableStream({ start(value) { controller = value; resolveStreamReady?.() } }), { headers: { 'Content-Type': 'text/event-stream' } }) })
agent.subscribe({ onMessagesChanged: ({ messages: next }) => { messages.value = [...next] } })
async function start() {
  busy.value = true
  answerSent = false
  streamReady = new Promise<void>(resolve => { resolveStreamReady = resolve })
  agent.setMessages([{ id: 'u-fixture', role: 'user', content: '展示一个销售报告（协议测试数据）' }])
  const pending = agent.runAgent({ runId: 'fixture' })
  await streamReady
  send({ type: 'RUN_STARTED', threadId: 'fixture', runId: 'fixture' })
  send({ type: 'ACTIVITY_SNAPSHOT', messageId, activityType: 'dataagent.ui', replace: true,
    content: { version: 1, surfaceId: 'sales', status: 'generating', title: '销售概览', summary: '仅验证事件接入，不是真实业务数据', cards: [] } })
  await pending
  busy.value = false
}
async function startA2ui() {
  busy.value = true
  a2uiAction.value = ''
  streamReady = new Promise<void>(resolve => { resolveStreamReady = resolve })
  agent.setMessages([{ id: 'u-a2ui', role: 'user', content: '生成一个可交互销售看板（协议测试数据）' }])
  const pending = agent.runAgent({ runId: 'fixture-a2ui' })
  await streamReady
  send({ type: 'RUN_STARTED', threadId: 'fixture', runId: 'fixture-a2ui' })
  send({
    type: 'ACTIVITY_SNAPSHOT',
    threadId: 'fixture',
    runId: 'fixture-a2ui',
    messageId: 'a2ui-sales--fixture-a2ui',
    activityType: 'a2ui-surface',
    replace: true,
    content: {
      a2ui_operations: [
        { version: 'v0.9', createSurface: { surfaceId: 'sales-dashboard', catalogId: 'https://opencode-agui-app.local/a2ui/data-agent-catalog.json' } },
        { version: 'v0.9', updateComponents: { surfaceId: 'sales-dashboard', components: [
          { component: 'Column', id: 'root', children: ['title', 'metrics', 'chart', 'action'] },
          { component: 'Text', id: 'title', text: '销售概览', variant: 'h2' },
          { component: 'Row', id: 'metrics', children: ['sales', 'orders'] },
          { component: 'MetricCard', id: 'sales', title: '销售额', value: { path: '/totalSales' }, delta: '+12.4%', trend: 'up' },
          { component: 'MetricCard', id: 'orders', title: '订单数', value: { path: '/orderCount' } },
          { component: 'BarChart', id: 'chart', title: '区域销售', xField: 'region', yField: 'sales', data: { path: '/regions' } },
          { component: 'ActionButton', id: 'action', label: '刷新看板', variant: 'primary', action: { event: { name: 'refresh_dashboard', context: { surfaceId: 'sales-dashboard' } } } },
        ] } },
        { version: 'v0.9', updateDataModel: { surfaceId: 'sales-dashboard', path: '/', value: {
          totalSales: '¥128,000', orderCount: 256, regions: [{ region: '华东', sales: 78000 }, { region: '华南', sales: 50000 }],
        } } },
      ],
    },
  })
  await pending
}
function update(status = 'ready') {
  if (!answerSent) {
    send({ type: 'TEXT_MESSAGE_START', messageId: 'answer', role: 'assistant' })
    send({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'answer', delta: '以下是本轮生成结果。卡片独立于执行过程，更新不会重复创建。' })
    send({ type: 'TEXT_MESSAGE_END', messageId: 'answer' })
    answerSent = true
  }
  send({ type: 'ACTIVITY_DELTA', messageId, activityType: 'dataagent.ui', patch: [
    { op: 'replace', path: '/status', value: status },
    { op: 'replace', path: '/cards', value: [
      { id: 'metrics', kind: 'metrics', items: [{ label: '销售总额', value: '¥128,000', detail: '示例数据' }, { label: '订单数', value: 256 }, { label: '客单价', value: '¥500' }] },
      { id: 'table', kind: 'table', title: '区域明细', columns: [{ key: 'region', label: '区域' }, { key: 'sales', label: '销售额' }], rows: [{ region: '华东', sales: 78000 }, { region: '华南', sales: 50000 }] },
      { id: 'note', kind: 'markdown', title: '说明', text: '**协议验证：** 这是模拟 SSE 驱动的真实 Vue 卡片。\n\n支持折叠、键盘操作和窄屏。' },
      { id: 'file', kind: 'file', name: '示例报告.md', url: '/dataagent/web/api/agui/file/12345678-1234-1234-1234-123456789abc', mimeType: 'text/markdown' },
    ] },
  ] })
}
function remove() { send({ type: 'ACTIVITY_DELTA', messageId, activityType: 'dataagent.ui', patch: [{ op: 'replace', path: '/status', value: 'removed' }] }) }
function finish() { send({ type: 'RUN_FINISHED', threadId: 'fixture', runId: 'fixture' }); controller?.close(); controller = undefined }
onMounted(() => {
  const params = new URLSearchParams(window.location.search)
  if (params.get('fixture') !== 'a2ui') return
  void startA2ui()
  if (params.get('click') === '1') window.setTimeout(() => {
    document.querySelector<HTMLButtonElement>('[data-a2ui-action]')?.click()
  }, 1000)
})
</script>
<template>
  <main class="dataagent-app fixture" :class="{ narrow }">
    <h1>生成式 UI · 事件验证</h1><p>模拟 SSE，仅验证协议和组件；不调用模型、不写入会话。</p>
    <nav><button :disabled="busy" @click="start">创建旧卡片</button><button :disabled="busy" @click="startA2ui">创建 A2UI</button><button :disabled="!busy" @click="update()">更新为完成</button><button :disabled="!busy" @click="update('error')">更新为失败</button><button :disabled="!busy" @click="remove">移除卡片</button><button :disabled="!busy" @click="finish">结束事件流</button><button @click="narrow = !narrow">切换窄屏</button></nav>
    <div class="fixture-messages">
      <template v-for="item in presentation" :key="item.key">
        <section v-if="item.kind === 'turn'">
          <ConversationMessage :message="item.user" />
          <template v-for="child in item.children" :key="child.key">
            <ConversationProcessGroup v-if="child.kind === 'process'" :steps="child.steps" />
            <ConversationMessage v-else :message="child.message" @preview="previewed = $event.name" @a2ui-action="a2uiAction = JSON.stringify($event)" />
          </template>
        </section>
      </template>
    </div>
    <p v-if="previewed" role="status">已收到预览事件：{{ previewed }}</p>
    <p v-if="a2uiAction" role="status">已收到 A2UI action：{{ a2uiAction }}</p>
  </main>
</template>
<style scoped>
.fixture { display: block; width: min(100%, 58rem); height: 100vh; overflow: auto; margin: auto; padding: 2rem; box-sizing: border-box; }
.fixture.narrow { width: 24rem; padding: 1rem; }
h1 { font-size: 1.25rem; } p { color: var(--da-text-muted); font-size: .875rem; }
nav { display: flex; flex-wrap: wrap; gap: .5rem; margin: 1.5rem 0; }
nav button { padding: .5rem .75rem; border: .0625rem solid var(--da-border); border-radius: .5rem; color: var(--da-text-primary); background: var(--da-surface-2); cursor: pointer; }
nav button:disabled { opacity: .4; }
.fixture-messages section { display: grid; gap: 1rem; }
</style>
