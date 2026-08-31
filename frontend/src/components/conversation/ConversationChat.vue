<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { BubbleList, XSender } from 'vue-element-plus-x'
import type { BubbleListInstance, BubbleListBoundaryState } from 'vue-element-plus-x/types/BubbleList'
import type { Interrupt, Message, State } from '@ag-ui/client'
import { createDataAgent, type DataAgentHttpAgent } from '../../agui/agent'
import { fetchConversationMessagePage } from '../../conversations/history-api'
import { buildConversationTimeline } from '../../conversations/timeline'
import { conversationRepository, deriveConversationName } from '../../conversations/local-repository'
import { createOpenCodeConversation, interruptOpenCodeConversation } from '../../conversations/opencode-session'
import { setSelectedModel, type ModelSelection } from '../../model/model-selection'
import DraftModelSelector from '../DraftModelSelector.vue'
import ModelSelector from '../ModelSelector.vue'
import ArtifactCard from '../artifacts/ArtifactCard.vue'
import SpecReviewCard from '../artifacts/SpecReviewCard.vue'
import AguiInterruptCard from './AguiInterruptCard.vue'
import ReasoningProcessCard from './ReasoningProcessCard.vue'

const props = defineProps<{
  agentId: string
  threadId: string
  displayName: string
  agentDisplayName: string
  draft?: boolean
}>()

const emit = defineEmits<{
  changed: []
  rename: [name: string]
  materialized: [sessionId: string]
}>()

const bubbleListRef = ref<BubbleListInstance | null>(null)
const senderRef = ref<InstanceType<typeof XSender> | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const hydrated = ref(false)
const messages = ref<Message[]>([])
const pendingInterrupts = ref<Interrupt[]>([])
const isRunning = ref(false)
const stopping = ref(false)
const resolvingInterrupts = ref(false)
const creatingSession = ref(false)
const draftModel = ref<ModelSelection | null>(null)
const materializedSessionId = ref('')
const historyNextCursor = ref<string | undefined>()
const historyLoading = ref(false)
const stagedFiles = ref<Array<{ id: string; file: File }>>([])

let currentAgent: DataAgentHttpAgent | null = null
let currentThreadId = ''
let currentAgentDirty = false
let agentSubscription: { unsubscribe: () => void } | null = null
let historyAbort: AbortController | undefined
let hydrationGeneration = 0
let persistTimer: number | undefined
const stagedInterruptAnswers = new Map<string, { status: 'resolved' | 'cancelled'; payload?: unknown }>()

const hasMessages = computed(() => messages.value.length > 0)
const hasInterrupts = computed(() => pendingInterrupts.value.length > 0)
const timeline = computed(() => buildConversationTimeline(messages.value, pendingInterrupts.value))
const topStatus = computed<BubbleListBoundaryState | null>(() => {
  if (historyLoading.value) return { type: 'loading', text: '正在加载更早的消息…' }
  if (!historyNextCursor.value && messages.value.length) return { type: 'no-more', text: '已加载全部历史消息' }
  return null
})

function effectiveSessionId() {
  return props.threadId.trim() || materializedSessionId.value
}

function messageId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `msg-${crypto.randomUUID()}`
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function persistSnapshot(threadId: string, target: DataAgentHttpAgent, immediate = false) {
  if (!threadId) return
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

function releaseCurrentAgent() {
  historyAbort?.abort()
  historyAbort = undefined
  if (currentAgent && currentThreadId && currentAgentDirty) persistSnapshot(currentThreadId, currentAgent, true)
  agentSubscription?.unsubscribe()
  agentSubscription = null
  currentAgent = null
  currentThreadId = ''
  currentAgentDirty = false
  pendingInterrupts.value = []
  stagedInterruptAnswers.clear()
  isRunning.value = false
}

function syncFromAgent(target: DataAgentHttpAgent) {
  messages.value = [...target.messages]
  pendingInterrupts.value = [...target.pendingInterrupts]
  isRunning.value = target.isRunning
}

function subscribeToAgent(target: DataAgentHttpAgent) {
  agentSubscription = target.subscribe({
    onRunStartedEvent: () => {
      isRunning.value = true
    },
    onRunFinishedEvent: ({ agent }) => {
      isRunning.value = false
      pendingInterrupts.value = [...agent.pendingInterrupts]
      stagedInterruptAnswers.clear()
    },
    onRunErrorEvent: ({ event, agent }) => {
      isRunning.value = false
      pendingInterrupts.value = [...agent.pendingInterrupts]
      ElMessage.error(event.message || 'Agent 执行失败')
    },
    onRunFailed: ({ error, agent }) => {
      isRunning.value = false
      pendingInterrupts.value = [...agent.pendingInterrupts]
      ElMessage.error(error.message)
    },
    onMessagesChanged: ({ agent }) => {
      messages.value = [...agent.messages]
      currentAgentDirty = true
      const sessionId = effectiveSessionId()
      if (sessionId && agent === currentAgent) persistSnapshot(sessionId, target)
    },
    onStateChanged: ({ agent }) => {
      currentAgentDirty = true
      const sessionId = effectiveSessionId()
      if (sessionId && agent === currentAgent) persistSnapshot(sessionId, target)
    },
  })
}

async function activateAgent(threadId: string, options: { draftSession?: boolean; skipRemoteHistory?: boolean } = {}) {
  if (currentAgent && currentThreadId === threadId) return currentAgent
  const generation = ++hydrationGeneration
  hydrated.value = false
  releaseCurrentAgent()

  const cached = threadId ? conversationRepository.get(threadId) : undefined
  const target = createDataAgent(
    threadId,
    cached?.messages ?? [],
    (cached?.state ?? {}) as State,
  )
  currentAgent = target
  currentThreadId = threadId
  messages.value = [...target.messages]
  historyNextCursor.value = undefined

  if (threadId && !options.skipRemoteHistory && !options.draftSession) {
    const controller = new AbortController()
    historyAbort = controller
    try {
      const page = await fetchConversationMessagePage(threadId, undefined, controller.signal)
      if (generation !== hydrationGeneration || currentAgent !== target) return target
      target.setMessages(page.messages)
      messages.value = [...page.messages]
      historyNextCursor.value = page.nextCursor
      conversationRepository.saveHydratedMessages(threadId, page.messages)
      emit('changed')
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        ElMessage.warning(
          target.messages.length
            ? '历史消息加载失败，已显示本地缓存'
            : (error instanceof Error ? error.message : String(error)),
        )
      }
    } finally {
      if (historyAbort === controller) historyAbort = undefined
    }
  }

  if (generation !== hydrationGeneration || currentAgent !== target) return target
  subscribeToAgent(target)
  syncFromAgent(target)
  hydrated.value = true
  await nextTick()
  bubbleListRef.value?.scrollToBottom(false)
  return target
}

async function loadOlderHistory() {
  const cursor = historyNextCursor.value
  const target = currentAgent
  const threadId = currentThreadId
  if (!cursor || !target || !threadId || historyLoading.value) {
    bubbleListRef.value?.loadMoreTopComplete()
    return
  }

  const controller = new AbortController()
  historyAbort = controller
  historyLoading.value = true
  try {
    const page = await fetchConversationMessagePage(threadId, cursor, controller.signal)
    if (target !== currentAgent || threadId !== currentThreadId) return
    historyNextCursor.value = page.nextCursor
    const known = new Set(target.messages.map(message => message.id))
    const older = page.messages.filter(message => !known.has(message.id))
    if (older.length) {
      const merged = [...older, ...target.messages]
      target.setMessages(merged)
      messages.value = [...merged]
      conversationRepository.saveHydratedMessages(threadId, merged)
      emit('changed')
    }
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      ElMessage.warning(error instanceof Error ? error.message : String(error))
    }
  } finally {
    historyLoading.value = false
    if (historyAbort === controller) historyAbort = undefined
    await nextTick()
    bubbleListRef.value?.loadMoreTopComplete()
  }
}

async function ensureSessionForFirstSend(text: string) {
  const existing = effectiveSessionId()
  if (existing) return existing
  if (!props.draft) throw new Error('当前会话缺少 sessionId')
  if (!draftModel.value) throw new Error('模型尚未加载完成，请稍后再发送')
  if (creatingSession.value) throw new Error('会话正在创建，请稍后重试')

  creatingSession.value = true
  try {
    const sessionId = await createOpenCodeConversation(draftModel.value)
    materializedSessionId.value = sessionId
    setSelectedModel(sessionId, draftModel.value)
    conversationRepository.create(sessionId, deriveConversationName(text))
    emit('materialized', sessionId)
    await activateAgent(sessionId, { draftSession: true, skipRemoteHistory: true })
    return sessionId
  } finally {
    creatingSession.value = false
  }
}

function stageFile(file: File) {
  if (file.size > 20 * 1024 * 1024) {
    ElMessage.error(`文件 ${file.name} 超过 20MB`)
    return
  }
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  stagedFiles.value = [...stagedFiles.value, { id, file }]
}

function handlePasteFile(file: File) {
  stageFile(file)
}

function handleFileInput(event: Event) {
  const input = event.target as HTMLInputElement
  Array.from(input.files ?? []).forEach(stageFile)
  input.value = ''
}

function removeStagedFile(id: string) {
  stagedFiles.value = stagedFiles.value.filter(item => item.id !== id)
}

async function uploadAttachment(file: File, threadId: string) {
  const formData = new FormData()
  formData.append('file', file, file.name)
  formData.append('threadId', threadId)
  const headers = new Headers()
  const token = import.meta.env.VITE_AGUI_TOKEN
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch('/dataagent/web/api/agui/file/upload', {
    method: 'POST',
    headers,
    body: formData,
    credentials: 'same-origin',
  })
  if (!response.ok) {
    let detail = ''
    try {
      const body = await response.json()
      detail = body?.message ?? body?.error?.message ?? body?.error ?? ''
    } catch {
      detail = await response.text().catch(() => '')
    }
    throw new Error(`文件上传失败 (${response.status})${detail ? `: ${detail}` : ''}`)
  }

  const body = await response.json()
  const uploaded = body?.data ?? body?.file ?? body
  const fileId = uploaded?.fileId ?? uploaded?.file_id ?? uploaded?.id
  const source = uploaded?.url ?? uploaded?.uri ?? uploaded?.downloadUrl ?? uploaded?.download_url ?? uploaded?.path ?? fileId ?? file.name
  if (!source) throw new Error('上传接口未返回文件引用')

  return {
    type: 'document',
    source: {
      type: 'url',
      value: String(source),
      mimeType: (uploaded?.mimeType ?? uploaded?.mime_type ?? uploaded?.contentType ?? file.type) || 'application/octet-stream',
    },
    metadata: {
      ...(fileId ? { fileId: String(fileId) } : {}),
      filename: uploaded?.filename ?? uploaded?.name ?? file.name,
      size: uploaded?.size ?? file.size,
    },
  }
}

async function buildUserMessage(text: string, sessionId: string): Promise<Message> {
  const uploads = stagedFiles.value.length
    ? await Promise.all(stagedFiles.value.map(item => uploadAttachment(item.file, sessionId)))
    : []
  const content = uploads.length
    ? [
        ...(text ? [{ type: 'text', text }] : []),
        ...uploads,
      ]
    : text
  return { id: messageId(), role: 'user', content } as Message
}

async function send() {
  if (isRunning.value || resolvingInterrupts.value || hasInterrupts.value) return
  const text = senderRef.value?.getModelValue()?.text?.trim() ?? ''
  if (!text && !stagedFiles.value.length) return

  try {
    const sessionId = await ensureSessionForFirstSend(text || '附件分析')
    const target = currentAgent ?? await activateAgent(sessionId, { skipRemoteHistory: true })
    const userMessage = await buildUserMessage(text, sessionId)
    target.addMessage(userMessage)
    messages.value = [...target.messages]
    stagedFiles.value = []
    senderRef.value?.clear()

    if (!props.draft && (props.displayName === '新需求' || props.displayName === '新对话' || props.displayName === '新分析')) {
      emit('rename', deriveConversationName(text || '附件分析'))
    }

    await target.runAgent()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

async function stop() {
  if (stopping.value) return
  const sessionId = effectiveSessionId()
  if (!sessionId) return
  stopping.value = true
  currentAgent?.abortRun()
  try {
    await interruptOpenCodeConversation(sessionId)
  } catch (error) {
    ElMessage.error(`前端已停止接收，但后端中断失败：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    stopping.value = false
    isRunning.value = false
  }
}

async function stageInterruptResolution(payload?: unknown, interruptId?: string) {
  if (!interruptId || resolvingInterrupts.value) return
  const activeIds = new Set(pendingInterrupts.value.map(item => item.id))
  if (!activeIds.has(interruptId)) return
  stagedInterruptAnswers.set(interruptId, { status: 'resolved', payload })
  if (pendingInterrupts.value.some(item => !stagedInterruptAnswers.has(item.id))) return

  const target = currentAgent
  if (!target) return
  resolvingInterrupts.value = true
  const original = [...pendingInterrupts.value]
  const entries = original.map(interrupt => {
    const answer = stagedInterruptAnswers.get(interrupt.id)!
    return {
      interruptId: interrupt.id,
      status: answer.status,
      ...(answer.status === 'resolved' ? { payload: answer.payload } : {}),
    } as const
  })

  pendingInterrupts.value = []
  try {
    await target.resumeInterrupts(entries)
  } catch (error) {
    pendingInterrupts.value = original
    stagedInterruptAnswers.clear()
    ElMessage.error(error instanceof Error ? error.message : String(error))
    throw error
  } finally {
    resolvingInterrupts.value = false
  }
}

watch([() => props.threadId, () => props.draft], ([threadId, draft]) => {
  const generation = ++hydrationGeneration
  historyAbort?.abort()
  if (!threadId && draft) {
    releaseCurrentAgent()
    messages.value = []
    stagedFiles.value = []
    materializedSessionId.value = ''
    draftModel.value = null
    historyNextCursor.value = undefined
    hydrated.value = true
    return
  }
  if (!threadId) return
  if (materializedSessionId.value && threadId !== materializedSessionId.value) materializedSessionId.value = ''
  void activateAgent(threadId).then(() => {
    if (generation !== hydrationGeneration) return
  })
}, { immediate: true })

onBeforeUnmount(() => {
  if (persistTimer) window.clearTimeout(persistTimer)
  releaseCurrentAgent()
})
</script>

<template>
  <section class="conversation-chat" :data-agent-id="agentId">
    <div v-if="!hydrated" class="conversation-chat__loading">
      <el-skeleton :rows="5" animated />
    </div>

    <template v-else>
      <section v-if="!hasMessages" class="conversation-welcome">
        <div class="conversation-welcome__identity">
          <span class="conversation-welcome__icon" aria-hidden="true">DA</span>
          <h2>DATA AGENT</h2>
        </div>
        <p>描述你的数据分析目标，我会与你澄清需求、确认分析 Spec，并协助完成分析与交付。</p>
      </section>

      <BubbleList
        v-if="hasMessages || hasInterrupts"
        ref="bubbleListRef"
        class="conversation-list"
        :list="timeline"
        :top-status="topStatus"
        :auto-scroll="true"
        show-back-button
        @load-more-top="loadOlderHistory"
      >
        <template #content="{ item }">
          <div class="conversation-message" :class="`conversation-message--${item.role}`">{{ item.content }}</div>
        </template>

        <template #item="{ item }">
          <ReasoningProcessCard
            v-if="item.itemType === 'reasoning'"
            :content="item.content"
            :running="isRunning && timeline.at(-1)?.key === item.key"
          />

          <ArtifactCard
            v-else-if="item.itemType === 'artifact' && item.artifact"
            :artifact="item.artifact"
          />

          <SpecReviewCard
            v-else-if="item.itemType === 'interrupt' && item.toolCallName === 'review_spec' && item.interrupt && item.toolCall"
            :interrupt="item.interrupt"
            :tool-call="item.toolCall"
            :resolving="resolvingInterrupts"
            :resolve="stageInterruptResolution"
          />

          <AguiInterruptCard
            v-else-if="item.itemType === 'interrupt' && item.interrupt"
            :interrupt="item.interrupt"
            :interrupts="item.interrupts ?? [item.interrupt]"
            :resolve="stageInterruptResolution"
          />

          <div v-else-if="item.itemType === 'tool'" class="conversation-tool">
            <span class="conversation-tool__dot"></span>
            <b>{{ item.toolCallName || '工具调用' }}</b>
            <span v-if="item.content">{{ item.content }}</span>
          </div>

          <div v-else-if="item.itemType === 'activity'" class="conversation-activity">{{ item.content || 'Agent 正在处理' }}</div>
        </template>
      </BubbleList>

      <div class="conversation-composer">
        <div class="conversation-composer__model">
          <DraftModelSelector
            v-if="draft && !threadId && !materializedSessionId"
            :disabled="isRunning || hasInterrupts || creatingSession"
            @selected="draftModel = $event"
          />
          <ModelSelector
            v-else
            :thread-id="threadId || materializedSessionId"
            :disabled="isRunning || hasInterrupts || creatingSession"
          />
        </div>

        <div v-if="stagedFiles.length" class="conversation-files">
          <span v-for="item in stagedFiles" :key="item.id" class="conversation-file">
            <span>{{ item.file.name }}</span>
            <button type="button" :aria-label="`移除 ${item.file.name}`" @click="removeStagedFile(item.id)">×</button>
          </span>
        </div>

        <input ref="fileInput" class="conversation-file-input" type="file" multiple @change="handleFileInput" />
        <XSender
          ref="senderRef"
          variant="updown"
          placeholder="描述你的数据分析目标"
          :loading="isRunning || stopping"
          :disabled="hasInterrupts || resolvingInterrupts || creatingSession"
          :tip-config="false"
          :custom-style="{ maxHeight: '180px' }"
          @submit="send"
          @cancel="stop"
          @paste-file="handlePasteFile"
        >
          <template #prefix>
            <button class="conversation-upload" type="button" :disabled="isRunning || hasInterrupts" @click="fileInput?.click()">＋ 文件</button>
          </template>
        </XSender>

        <p v-if="hasInterrupts" class="conversation-composer__hint">请先完成上方待确认内容，再继续发送消息。</p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.conversation-chat{min-height:0;height:100%;display:flex;flex-direction:column;color:var(--da-text-primary)}
.conversation-chat__loading{padding:24px}
.conversation-welcome{width:min(720px,calc(100% - 40px));margin:auto auto 22px;text-align:center}
.conversation-welcome__identity{display:flex;align-items:center;justify-content:center;gap:12px}
.conversation-welcome__icon{width:34px;height:34px;display:grid;place-items:center;border:1px solid var(--da-border);border-radius:10px;background:var(--da-surface-1);color:var(--da-text-primary);font-size:11px;font-weight:720}
.conversation-welcome h2{margin:0;color:var(--da-text-primary);font-size:20px;letter-spacing:.08em}
.conversation-welcome p{max-width:620px;margin:12px auto 0;color:var(--da-text-muted);font-size:14px;line-height:1.7}
.conversation-list{min-height:0;flex:1;padding:18px 22px 8px}
.conversation-message{white-space:pre-wrap;overflow-wrap:anywhere;color:var(--da-text-primary);font-size:14px;line-height:1.72}
.conversation-message--user{color:inherit}
.conversation-tool,.conversation-activity{width:min(100%,680px);display:flex;align-items:center;gap:8px;padding:7px 10px;color:var(--da-text-muted);font-size:12px}
.conversation-tool__dot{width:6px;height:6px;border-radius:50%;background:var(--da-text-subtle)}
.conversation-tool b{color:var(--da-text-secondary);font-weight:620}
.conversation-composer{width:min(900px,calc(100% - 28px));margin:0 auto;padding:8px 0 14px}
.conversation-composer__model{min-height:30px;display:flex;align-items:center;margin-bottom:7px}
.conversation-files{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:7px}
.conversation-file{display:inline-flex;align-items:center;gap:7px;max-width:260px;padding:5px 8px;border:1px solid var(--da-border);border-radius:8px;background:var(--da-surface-1);color:var(--da-text-muted);font-size:11px}
.conversation-file>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.conversation-file button{width:18px;height:18px;padding:0;border:0;background:transparent;color:var(--da-text-subtle);cursor:pointer}
.conversation-file-input{display:none}
.conversation-upload{height:28px;padding:0 8px;border:1px solid var(--da-border);border-radius:7px;background:transparent;color:var(--da-text-muted);font:inherit;font-size:11px;cursor:pointer}
.conversation-upload:hover:not(:disabled){border-color:var(--da-border-strong);color:var(--da-text-primary)}
.conversation-upload:disabled{cursor:not-allowed;opacity:.5}
.conversation-composer__hint{margin:6px 2px 0;color:var(--da-text-subtle);font-size:11px}
.conversation-chat :deep(.el-bubble-list){background:transparent}
@media(max-width:720px){.conversation-list{padding-inline:12px}.conversation-composer{width:calc(100% - 20px)}.conversation-welcome{width:calc(100% - 24px)}}
</style>
