<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { CopilotChat, useAgent } from '@copilotkit/vue/v2'
import type { AbstractAgent, Interrupt, ResumeEntry } from '@ag-ui/client'
import { conversationRepository, deriveConversationName } from '../../conversations/local-repository'
import { workspaceController } from '../../workspace/store'

const props = defineProps<{
  agentId: string
  threadId: string
  displayName: string
  agentDisplayName: string
}>()

const emit = defineEmits<{ changed: []; rename: [name: string] }>()
const hydrated = ref(false)
const { agent } = useAgent({ agentId: () => props.agentId, threadId: () => props.threadId, throttleMs: 60 })
type PermissionDecision = 'once' | 'always' | 'reject'
const pendingInterrupts = ref<Interrupt[]>([])
const decisions = ref<Record<string, PermissionDecision>>({})
const resumeError = ref('')
const resuming = ref(false)
let persistTimer: number | undefined
let currentAgent: AbstractAgent | null = null
let currentThreadId = ''
const hasInterrupts = computed(() => pendingInterrupts.value.length > 0)
const chatLabels = computed(() => ({
  chatInputPlaceholder: '描述你的数据业务目标，我将与你逐步澄清需求，并自主完成Specification、数据方案、数据集成、ETL开发、治理验证与交付。',
  welcomeMessageText: `我是 ${props.agentDisplayName}，你的 SA 数据需求开发与交付助手。`,
  modalHeaderTitle: props.agentDisplayName,
})) as any

function persistSnapshot(threadId: string, target: AbstractAgent, immediate = false) {
  const save = () => {
    conversationRepository.saveSnapshot(threadId, target.messages, target.state)
    emit('changed')
  }
  if (immediate) {
    if (persistTimer) window.clearTimeout(persistTimer)
    persistTimer = undefined
    save()
    return
  }
  if (persistTimer) window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(save, 100)
}

function updateInterrupts(interrupts: Interrupt[], threadId?: string) {
  pendingInterrupts.value = interrupts
  const ids = new Set(interrupts.map(item => item.id))
  decisions.value = Object.fromEntries(Object.entries(decisions.value).filter(([id]) => ids.has(id)))
  if (!interrupts.length) resumeError.value = ''
  if (threadId) conversationRepository.saveInterrupts(threadId, interrupts)
}

function interruptAction(interrupt: Interrupt) {
  const metadata = interrupt.metadata as { action?: string } | undefined
  return metadata?.action || (interrupt.reason === 'tool_call' ? '工具调用' : '继续执行')
}

function interruptResource(interrupt: Interrupt) {
  const metadata = interrupt.metadata as { resources?: unknown } | undefined
  const resources = metadata?.resources
  if (Array.isArray(resources)) return resources.map(String).join(' · ')
  if (resources) return String(resources)
  return interrupt.toolCallId || interrupt.id
}

async function decide(interruptId: string, decision: PermissionDecision) {
  if (resuming.value || !agent.value) return
  decisions.value = { ...decisions.value, [interruptId]: decision }
  await nextTick()
  if (!pendingInterrupts.value.every(item => decisions.value[item.id])) return

  resumeError.value = ''
  resuming.value = true
  try {
    const resume: ResumeEntry[] = pendingInterrupts.value.map(item => ({
      interruptId: item.id,
      status: 'resolved',
      payload: { decision: decisions.value[item.id] },
    }))
    await agent.value.runAgent({ resume })
  } catch (reason) {
    resumeError.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    resuming.value = false
  }
}

watch([agent, () => props.threadId], ([nextAgent, nextThreadId], _, onCleanup) => {
  hydrated.value = false
  updateInterrupts([])
  if (!nextAgent) return
  const threadId = nextThreadId
  currentAgent = nextAgent
  currentThreadId = threadId
  const conversation = conversationRepository.get(threadId)
  if (conversation) {
    nextAgent.setMessages(conversation.messages)
    nextAgent.setState(conversation.state)
    nextAgent.pendingInterrupts = conversation.pendingInterrupts ?? nextAgent.pendingInterrupts
  }
  // Workspace tools persist synchronously in the dedicated per-thread store.
  // A throttled conversation snapshot can lag behind the latest tool result,
  // so it must not overwrite the newer workspace when a page is reloaded.
  const workspace = workspaceController.snapshot()
  if (workspace) nextAgent.setState({ ...(nextAgent.state ?? {}), workspace })
  updateInterrupts(nextAgent.pendingInterrupts ?? [])
  const subscription = nextAgent.subscribe({
    onMessagesChanged: ({ agent: changedAgent }) => persistSnapshot(threadId, changedAgent),
    onStateChanged: ({ agent: changedAgent }) => {
      const workspace = (changedAgent.state as { workspace?: unknown })?.workspace
      if (workspace && typeof workspace === 'object') workspaceController.applyShared(workspace as any)
      persistSnapshot(threadId, changedAgent)
    },
    onRunFinishedEvent: (params) => {
      updateInterrupts(params.outcome === 'interrupt' ? params.interrupts : [], threadId)
    },
  })
  hydrated.value = true
  onCleanup(() => {
    persistSnapshot(threadId, nextAgent, true)
    subscription.unsubscribe()
    if (currentAgent === nextAgent) { currentAgent = null; currentThreadId = '' }
  })
}, { immediate: true })

function onSubmitMessage(value: string) {
  if (props.displayName === '新需求' || props.displayName === '新对话' || props.displayName === '新分析') emit('rename', deriveConversationName(value))
}

onBeforeUnmount(() => {
  if (persistTimer) window.clearTimeout(persistTimer)
  if (currentAgent && currentThreadId) persistSnapshot(currentThreadId, currentAgent, true)
})
</script>

<template>
  <div class="conversation-chat visual-chat dark" :class="{ 'has-interrupts': hasInterrupts }">
    <div v-if="!hydrated" class="chat-loading"><el-skeleton :rows="5" animated /></div>
    <CopilotChat
      v-else
      :key="threadId"
      :agent-id="agentId"
      :thread-id="threadId"
      :labels="chatLabels"
      :throttle-ms="60"
      @submit-message="onSubmitMessage"
    />

    <transition name="permission-rise">
      <section v-if="hasInterrupts" class="agui-permission" role="alert" aria-live="assertive">
        <header>
          <div>
            <span>AG-UI · HUMAN APPROVAL</span>
            <b>{{ pendingInterrupts.length > 1 ? `${pendingInterrupts.length} 项操作等待授权` : '操作等待授权' }}</b>
          </div>
          <i>{{ resuming ? 'RESUMING' : 'ACTION REQUIRED' }}</i>
        </header>

        <div class="permission-list">
          <article v-for="interrupt in pendingInterrupts" :key="interrupt.id">
            <div class="permission-copy">
              <b>{{ interruptAction(interrupt) }}</b>
              <p>{{ interrupt.message || 'Agent 请求在继续执行前获得你的授权。' }}</p>
              <code>{{ interruptResource(interrupt) }}</code>
            </div>
            <div class="permission-actions">
              <button
                :disabled="resuming"
                :class="{ selected: decisions[interrupt.id] === 'once' }"
                @click="decide(interrupt.id, 'once')"
              >允许一次</button>
              <button
                :disabled="resuming"
                :class="{ selected: decisions[interrupt.id] === 'always' }"
                @click="decide(interrupt.id, 'always')"
              >始终允许</button>
              <button
                class="reject"
                :disabled="resuming"
                :class="{ selected: decisions[interrupt.id] === 'reject' }"
                @click="decide(interrupt.id, 'reject')"
              >拒绝</button>
            </div>
          </article>
        </div>
        <p v-if="resumeError" class="permission-error">{{ resumeError }}</p>
        <small v-else-if="pendingInterrupts.length > 1">为每一项选择后，将通过同一个 AG-UI Run 自动恢复执行。</small>
      </section>
    </transition>
  </div>
</template>

<style scoped>
.conversation-chat{position:relative}
.agui-permission{position:absolute;z-index:12;left:14px;right:14px;bottom:102px;max-height:min(52%,390px);padding:13px;border:1px solid rgba(230,197,116,.34);border-radius:13px;background:linear-gradient(150deg,rgba(36,32,27,.985),rgba(23,24,31,.99));box-shadow:0 18px 48px rgba(0,0,0,.42),0 0 0 1px rgba(255,255,255,.025) inset;color:#f4f0e6;overflow:auto;backdrop-filter:blur(18px)}
.agui-permission header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 1px 10px;border-bottom:1px solid rgba(230,197,116,.15)}
.agui-permission header>div{display:flex;flex-direction:column;gap:4px}.agui-permission header span{color:#a99b7d;font-size:8px;font-weight:750;letter-spacing:.15em}.agui-permission header b{font-size:12px;font-weight:650}.agui-permission header i{font-style:normal;color:#e8c875;font-size:8px;letter-spacing:.1em}
.permission-list{display:flex;flex-direction:column;gap:9px;margin-top:10px}.permission-list article{padding:10px;border:1px solid rgba(255,255,255,.075);border-radius:10px;background:rgba(255,255,255,.025)}
.permission-copy{display:flex;flex-direction:column;gap:4px}.permission-copy b{color:#f0ddaa;font-size:11px}.permission-copy p{margin:0;color:#c6bdab;font-size:10px;line-height:1.5}.permission-copy code{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#918a7c;font-size:8.5px}
.permission-actions{display:flex;gap:7px;margin-top:9px}.permission-actions button{padding:7px 10px;border:1px solid rgba(230,197,116,.25);border-radius:7px;background:rgba(230,197,116,.075);color:#ead9aa;font-size:9.5px;cursor:pointer;transition:.16s}.permission-actions button:hover,.permission-actions button.selected{border-color:#e2c570;background:#d7b85f;color:#17140d}.permission-actions button.reject{margin-left:auto;border-color:rgba(240,111,130,.27);background:rgba(240,111,130,.07);color:#efadb7}.permission-actions button.reject:hover,.permission-actions button.reject.selected{border-color:#dc7181;background:#c75c6d;color:#fff}.permission-actions button:disabled{opacity:.45;cursor:wait}
.agui-permission>small{display:block;margin-top:9px;color:#9c9588;font-size:8.5px}.permission-error{margin:9px 0 0;color:#ff9cac;font-size:9px}.permission-rise-enter-active,.permission-rise-leave-active{transition:.2s ease}.permission-rise-enter-from,.permission-rise-leave-to{opacity:0;transform:translateY(8px)}
.has-interrupts :deep([data-testid="copilot-chat-input-shell"]){opacity:.48;pointer-events:none}.has-interrupts :deep([data-testid="copilot-chat-input-textarea"]){cursor:not-allowed}
@media(max-width:540px){.agui-permission{left:8px;right:8px;bottom:96px}.permission-actions{flex-wrap:wrap}.permission-actions button.reject{margin-left:0}}
</style>
