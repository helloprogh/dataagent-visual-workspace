<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

interface Scenario {
  id: string
  label: string
  status: 'supported' | 'debug'
  description: string
  events: string[]
}

interface InterfaceItem {
  consumer: string
  ui: string
  upstream: string[]
  purpose: string
}

interface SessionItem {
  threadId: string
  sessionId: string
  connected: boolean
  title?: string
  agent?: string
  model?: { id?: string; providerID?: string }
  queueSize?: number
  permissions?: Array<{ id: string; action?: string; resources?: string[] }>
  tokens?: Record<string, number>
  error?: string
}

const props = defineProps<{ activeThreadId: string }>()
const emit = defineEmits<{ close: [] }>()
const loading = ref(false)
const error = ref('')
const capabilities = ref<any>()
const sessions = ref<SessionItem[]>([])
const context = ref<any[]>()
const contextLoading = ref(false)

const activeSession = computed(() => sessions.value.find(item => item.threadId === props.activeThreadId))
const contextSummary = computed(() => {
  if (!context.value) return ''
  const roles = context.value.reduce<Record<string, number>>((result, item) => {
    const role = item.role ?? item.type ?? 'event'
    result[role] = (result[role] ?? 0) + 1
    return result
  }, {})
  return Object.entries(roles).map(([role, count]) => `${role} ${count}`).join(' · ')
})

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || `请求失败 (${response.status})`)
  return body
}

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    const [capabilityData, sessionData] = await Promise.all([
      requestJson('/api/adapter/capabilities'),
      requestJson('/api/adapter/sessions'),
    ])
    capabilities.value = capabilityData
    sessions.value = sessionData.sessions ?? []
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    loading.value = false
  }
}

async function loadContext() {
  if (!props.activeThreadId) return
  contextLoading.value = true
  error.value = ''
  try {
    const body = await requestJson(`/api/adapter/sessions/${encodeURIComponent(props.activeThreadId)}/context`)
    context.value = body.data ?? []
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    contextLoading.value = false
  }
}

async function replyPermission(requestId: string, reply: 'once' | 'always' | 'reject') {
  error.value = ''
  try {
    await requestJson(`/api/adapter/sessions/${encodeURIComponent(props.activeThreadId)}/permissions/${encodeURIComponent(requestId)}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply }),
    })
    await refresh()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  }
}

watch(() => props.activeThreadId, () => { context.value = undefined })
onMounted(refresh)
</script>

<template>
  <section class="protocol-panel">
    <header class="protocol-head">
      <div>
        <span>OPENCODE2 × AG-UI</span>
        <h3>协议联调与接口能力</h3>
      </div>
      <div class="protocol-actions">
        <button title="刷新" :disabled="loading" @click="refresh">↻</button>
        <button title="关闭" @click="emit('close')">×</button>
      </div>
    </header>

    <div v-if="error" class="protocol-error">{{ error }}</div>

    <div class="protocol-scroll">
      <article class="upstream-card" :class="{ online: capabilities?.upstream?.connected }">
        <div class="upstream-line">
          <i></i>
          <div>
            <b>{{ capabilities?.upstream?.connected ? 'OpenCode2 已连接' : 'OpenCode2 未连接' }}</b>
            <small>{{ capabilities?.upstream?.url || '正在发现本地 service…' }}</small>
          </div>
          <span>{{ capabilities?.upstream?.version || 'UNKNOWN' }}</span>
        </div>
        <div class="flow-line">
          <code>Vue</code><em>→</em><code>POST /agent</code><em>→</em><code>Adapter</code><em>→</em><code>/api/event</code>
        </div>
      </article>

      <div class="protocol-section-title"><span>SUPPORTED SCENARIOS</span><b>{{ capabilities?.scenarios?.length || 0 }}</b></div>
      <div class="scenario-grid">
        <article v-for="item in (capabilities?.scenarios || []) as Scenario[]" :key="item.id" class="scenario-card">
          <div><i :class="item.status"></i><b>{{ item.label }}</b><span>{{ item.status === 'debug' ? 'DEBUG' : 'READY' }}</span></div>
          <p>{{ item.description }}</p>
          <code>{{ item.events.join(' · ') }}</code>
        </article>
      </div>

      <div class="protocol-section-title"><span>ACTIVE SESSION MAPPING</span><b>{{ sessions.length }}</b></div>
      <article v-if="activeSession" class="session-card active">
        <div class="session-title"><span>CURRENT THREAD</span><b>{{ activeSession.agent || 'main agent' }}</b></div>
        <code>{{ activeSession.threadId }}</code>
        <div class="session-arrow">↓</div>
        <code>{{ activeSession.sessionId }}</code>
        <div class="session-meta">
          <span>{{ activeSession.model?.providerID }}/{{ activeSession.model?.id }}</span>
          <span>QUEUE {{ activeSession.queueSize ?? 0 }}</span>
          <button :disabled="contextLoading" @click="loadContext">{{ contextLoading ? '读取中…' : '查看上下文' }}</button>
        </div>
        <div v-if="context" class="context-preview">
          <b>活动上下文：{{ context.length }} 条</b>
          <span>{{ contextSummary || '暂无消息' }}</span>
        </div>
        <div v-for="permission in activeSession.permissions || []" :key="permission.id" class="permission-card">
          <div><b>等待工具授权 · {{ permission.action }}</b><code>{{ permission.resources?.join(', ') }}</code></div>
          <span>
            <button @click="replyPermission(permission.id, 'once')">允许一次</button>
            <button @click="replyPermission(permission.id, 'always')">始终允许</button>
            <button class="reject" @click="replyPermission(permission.id, 'reject')">拒绝</button>
          </span>
        </div>
      </article>
      <div v-else class="session-empty">发送第一条消息后，这里会显示 threadId → OpenCode2 sessionID 映射。</div>

      <div class="protocol-section-title"><span>UI INTERFACE CATALOG</span><b>{{ capabilities?.interfaces?.length || 0 }}</b></div>
      <details v-for="item in (capabilities?.interfaces || []) as InterfaceItem[]" :key="item.consumer" class="interface-item">
        <summary><b>{{ item.consumer }}</b><code>{{ item.ui }}</code></summary>
        <p>{{ item.purpose }}</p>
        <div v-for="endpoint in item.upstream" :key="endpoint"><span>OpenCode2</span><code>{{ endpoint }}</code></div>
      </details>
    </div>
  </section>
</template>

<style scoped>
.protocol-panel{position:absolute;inset:0;z-index:15;display:flex;flex-direction:column;background:linear-gradient(180deg,rgba(20,25,35,.995),rgba(12,16,23,.998));color:#e8ebf2}.protocol-head{height:76px;flex:none;padding:18px 18px 14px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,.09)}.protocol-head span,.protocol-section-title span{font-size:8px;letter-spacing:.16em;color:#8e99ad}.protocol-head h3{margin:4px 0 0;font-size:15px}.protocol-actions{display:flex;gap:7px}.protocol-actions button{width:30px;height:30px;border:1px solid rgba(255,255,255,.1);border-radius:8px;background:rgba(255,255,255,.03);color:#b9c2d2;cursor:pointer}.protocol-scroll{flex:1;min-height:0;overflow:auto;padding:14px 16px 24px}.protocol-error{margin:12px 16px 0;padding:9px 11px;border:1px solid rgba(255,107,130,.25);border-radius:8px;color:#ff9bad;background:rgba(255,107,130,.06);font-size:10px}.upstream-card,.session-card{padding:13px;border:1px solid rgba(255,255,255,.09);border-radius:11px;background:rgba(255,255,255,.025)}.upstream-line{display:grid;grid-template-columns:9px 1fr auto;gap:9px;align-items:center}.upstream-line>i{width:8px;height:8px;border-radius:50%;background:#ff6b82}.upstream-card.online .upstream-line>i{background:#46e6a7;box-shadow:0 0 12px rgba(70,230,167,.45)}.upstream-line div{display:flex;flex-direction:column;gap:3px;min-width:0}.upstream-line b{font-size:11px}.upstream-line small{overflow:hidden;text-overflow:ellipsis;color:#8e99ad;font-size:9px}.upstream-line>span{font-size:8px;color:#9faeff}.flow-line{display:flex;align-items:center;gap:5px;margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.065);overflow:hidden}.flow-line code{font-size:7.5px;color:#b8c2d3;white-space:nowrap}.flow-line em{font-style:normal;color:#5f6a7c}.protocol-section-title{margin:17px 1px 8px;display:flex;align-items:center;justify-content:space-between}.protocol-section-title b{font-size:8px;color:#8fa3ff}.scenario-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.scenario-card{padding:10px;border:1px solid rgba(255,255,255,.075);border-radius:9px;background:rgba(255,255,255,.018)}.scenario-card>div{display:grid;grid-template-columns:6px 1fr auto;gap:6px;align-items:center}.scenario-card i{width:5px;height:5px;border-radius:50%;background:#46e6a7}.scenario-card i.debug{background:#f6c65c}.scenario-card b{font-size:9.5px}.scenario-card span{font-size:6.5px;color:#7c8799}.scenario-card p{min-height:45px;margin:7px 0;color:#9fa9ba;font-size:8.5px;line-height:1.55}.scenario-card code{display:block;color:#78869b;font-size:7px;line-height:1.45}.session-card.active{border-color:rgba(143,163,255,.2);background:linear-gradient(145deg,rgba(95,141,255,.06),rgba(150,120,255,.04))}.session-title{display:flex;justify-content:space-between;margin-bottom:8px}.session-title span{font-size:7px;letter-spacing:.12em;color:#8390a4}.session-title b{font-size:9px;color:#aebaff}.session-card>code{display:block;overflow:hidden;text-overflow:ellipsis;color:#b7c0cf;font-size:8px;white-space:nowrap}.session-arrow{margin:4px 0;color:#606c7f;font-size:9px}.session-meta{margin-top:10px;display:flex;align-items:center;gap:8px;color:#8793a7;font-size:7.5px}.session-meta button{margin-left:auto;padding:5px 8px;border:1px solid rgba(143,163,255,.18);border-radius:6px;background:rgba(143,163,255,.07);color:#bbc4ff;font-size:8px;cursor:pointer}.context-preview{margin-top:9px;padding-top:8px;border-top:1px solid rgba(255,255,255,.07);display:flex;justify-content:space-between;gap:8px;font-size:8px}.context-preview span{color:#8e99aa}.session-empty{padding:17px 12px;border:1px dashed rgba(255,255,255,.09);border-radius:9px;color:#818c9e;font-size:9px;line-height:1.5}.interface-item{padding:9px 10px;border-bottom:1px solid rgba(255,255,255,.065)}.interface-item summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:8px}.interface-item summary b{font-size:9px}.interface-item summary code{max-width:58%;overflow:hidden;text-overflow:ellipsis;color:#8fa3ff;font-size:7.5px;white-space:nowrap}.interface-item p{margin:8px 0;color:#9ba5b6;font-size:8.5px;line-height:1.5}.interface-item>div{display:grid;grid-template-columns:62px 1fr;gap:6px;margin-top:4px}.interface-item>div span{font-size:7px;color:#687487}.interface-item>div code{font-size:7.5px;color:#aab4c5;overflow-wrap:anywhere}@media(max-width:420px){.scenario-grid{grid-template-columns:1fr}}
.permission-card{margin-top:9px;padding:9px;border:1px solid rgba(246,198,92,.18);border-radius:8px;background:rgba(246,198,92,.045)}.permission-card>div{display:flex;flex-direction:column;gap:4px}.permission-card b{font-size:8.5px;color:#e7cc8b}.permission-card code{color:#9b927c;font-size:7.5px;overflow-wrap:anywhere}.permission-card>span{display:flex;gap:5px;margin-top:8px}.permission-card button{padding:4px 7px;border:1px solid rgba(246,198,92,.17);border-radius:5px;background:rgba(246,198,92,.07);color:#ddc98f;font-size:7.5px;cursor:pointer}.permission-card button.reject{border-color:rgba(255,107,130,.18);background:rgba(255,107,130,.05);color:#e69aaa}
</style>
