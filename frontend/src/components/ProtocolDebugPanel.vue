<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

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
const loading = ref(false)
const error = ref('')
const sessions = ref<SessionItem[]>([])
const context = ref<any[]>()
const contextLoading = ref(false)
let refreshTimer: number | undefined

const activeSession = computed(() => sessions.value.find(item => item.threadId === props.activeThreadId))
const pendingPermissions = computed(() => activeSession.value?.permissions ?? [])
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
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    const sessionData = await requestJson('/api/adapter/sessions')
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

watch(() => props.activeThreadId, () => {
  context.value = undefined
  refresh()
})
onMounted(() => {
  refresh()
  refreshTimer = window.setInterval(refresh, 2500)
})
onBeforeUnmount(() => {
  if (refreshTimer) window.clearInterval(refreshTimer)
})
</script>

<template>
  <section class="protocol-panel">
    <header class="protocol-head">
      <div>
        <span>OPENCODE2 × AG-UI</span>
        <h3>会话与授权联调</h3>
      </div>
      <div class="protocol-actions">
        <button title="刷新" :disabled="loading" @click="refresh">↻</button>
      </div>
    </header>

    <div v-if="error" class="protocol-error">{{ error }}</div>

    <div class="protocol-scroll">
      <section class="authorization-section first-section" :class="{ pending: pendingPermissions.length }">
        <div class="authorization-head">
          <div>
            <span>TOOL AUTHORIZATION</span>
            <b>{{ pendingPermissions.length ? `${pendingPermissions.length} 项等待处理` : '当前无需授权' }}</b>
          </div>
          <i>{{ pendingPermissions.length ? 'ACTION REQUIRED' : 'CLEAR' }}</i>
        </div>
        <div v-if="!activeSession" class="authorization-empty">发送消息后，这里会持续显示当前会话的工具授权状态。</div>
        <div v-else-if="!pendingPermissions.length" class="authorization-empty">当前会话没有待处理的工具授权，请求会自动继续执行。</div>
        <div v-for="permission in pendingPermissions" :key="permission.id" class="permission-card">
          <div>
            <b>等待工具授权 · {{ permission.action || 'operation' }}</b>
            <code>{{ permission.resources?.join(', ') || permission.id }}</code>
          </div>
          <span>
            <button class="primary" @click="replyPermission(permission.id, 'once')">允许一次</button>
            <button @click="replyPermission(permission.id, 'always')">始终允许</button>
            <button class="reject" @click="replyPermission(permission.id, 'reject')">拒绝</button>
          </span>
        </div>
      </section>

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
      </article>
      <div v-else class="session-empty">发送第一条消息后，这里会显示 threadId → OpenCode2 sessionID 映射。</div>
    </div>
  </section>
</template>

<style scoped>
.protocol-panel{position:relative;z-index:4;min-height:0;display:flex;flex-direction:column;border-top:1px solid rgba(143,163,255,.18);background:linear-gradient(180deg,#151a24,#0e131c);color:#eef1f7;box-shadow:0 -14px 38px rgba(0,0,0,.22)}
.protocol-head{height:58px;flex:none;padding:11px 18px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,.09)}
.protocol-head span,.protocol-section-title span,.authorization-head span{font-size:9px;letter-spacing:.15em;color:#9ca6ba}.protocol-head h3{margin:3px 0 0;font-size:15px}.protocol-actions button{width:34px;height:34px;border:1px solid rgba(255,255,255,.11);border-radius:9px;background:rgba(255,255,255,.04);color:#d1d7e3;font-size:16px;cursor:pointer}.protocol-scroll{flex:1;min-height:0;overflow:auto;padding:14px 18px 26px}.protocol-error{margin:10px 18px 0;padding:10px 12px;border:1px solid rgba(255,107,130,.3);border-radius:9px;color:#ffadb9;background:rgba(255,107,130,.08);font-size:11px}
.session-card,.authorization-section{padding:13px;border:1px solid rgba(255,255,255,.10);border-radius:11px;background:rgba(255,255,255,.03)}
.authorization-section.first-section{margin-top:0}.authorization-section.pending{border-color:rgba(246,198,92,.34);background:linear-gradient(145deg,rgba(246,198,92,.09),rgba(246,198,92,.025))}.authorization-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.authorization-head>div{display:flex;flex-direction:column;gap:4px}.authorization-head b{font-size:12px;color:#dce2ed}.authorization-head i{font-style:normal;font-size:9px;letter-spacing:.08em;color:#72d7ad}.authorization-section.pending .authorization-head i{color:#f6c65c}.authorization-empty{margin-top:10px;padding-top:9px;border-top:1px solid rgba(255,255,255,.07);color:#9fa9ba;font-size:10px;line-height:1.5}
.permission-card{margin-top:10px;padding:11px;border:1px solid rgba(246,198,92,.24);border-radius:9px;background:rgba(8,10,14,.28)}.permission-card>div{display:flex;flex-direction:column;gap:5px}.permission-card b{font-size:11px;color:#f1d99f}.permission-card code{color:#b7aa8a;font-size:9px;overflow-wrap:anywhere}.permission-card>span{display:flex;gap:7px;margin-top:10px}.permission-card button{padding:7px 10px;border:1px solid rgba(246,198,92,.23);border-radius:7px;background:rgba(246,198,92,.08);color:#ead59f;font-size:10px;cursor:pointer}.permission-card button.primary{background:#d7b258;color:#14110a;border-color:#e6c77b;font-weight:700}.permission-card button.reject{margin-left:auto;border-color:rgba(255,107,130,.25);background:rgba(255,107,130,.07);color:#f0a7b2}
.protocol-section-title{margin:17px 1px 8px;display:flex;align-items:center;justify-content:space-between}.protocol-section-title b{font-size:9px;color:#9dacff}
.session-card.active{border-color:rgba(143,163,255,.24);background:linear-gradient(145deg,rgba(95,141,255,.07),rgba(150,120,255,.045))}.session-title{display:flex;justify-content:space-between;margin-bottom:8px}.session-title span{font-size:9px;letter-spacing:.12em;color:#909bae}.session-title b{font-size:10px;color:#bdc6ff}.session-card>code{display:block;overflow:hidden;text-overflow:ellipsis;color:#c4cbd7;font-size:9.5px;white-space:nowrap}.session-arrow{margin:5px 0;color:#758095;font-size:11px}.session-meta{margin-top:10px;display:flex;align-items:center;gap:9px;color:#9da7b9;font-size:9px}.session-meta button{margin-left:auto;padding:6px 9px;border:1px solid rgba(143,163,255,.22);border-radius:7px;background:rgba(143,163,255,.08);color:#c9d0ff;font-size:9px;cursor:pointer}.context-preview{margin-top:9px;padding-top:9px;border-top:1px solid rgba(255,255,255,.08);display:flex;justify-content:space-between;gap:8px;font-size:9px}.context-preview span{color:#9ba5b7}.session-empty{padding:16px 12px;border:1px dashed rgba(255,255,255,.11);border-radius:9px;color:#99a3b5;font-size:10px;line-height:1.55}
</style>
