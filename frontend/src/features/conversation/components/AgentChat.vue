<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Message, ResumeEntry } from '@ag-ui/client'
import { ElMessage } from 'element-plus'
import { Welcome, XSender } from 'vue-element-plus-x'
import type { ModelSelection } from '../../model/types'
import ModelSelector from '../../model/components/ModelSelector.vue'
import { useAgentConversation } from '../composables/useAgentConversation'
import AgentMark from './AgentMark.vue'
import ConversationMessage from './ConversationMessage.vue'
import ConversationProcessGroup from './ConversationProcessGroup.vue'
import FilePreviewPanel from './FilePreviewPanel.vue'
import InterruptCard from './InterruptCard.vue'
import type { ConversationFilePreview } from '../types/filePreview'

const props = defineProps<{
  sessionId?: string
  displayName?: string
}>()

const emit = defineEmits<{
  materialized: [sessionId: string, displayName: string]
  changed: []
}>()

const {
  threadId,
  messages,
  running,
  hydrating,
  loadingOlder,
  nextCursor,
  pendingInterrupts,
  attachments,
  error,
  open,
  loadOlder,
  stageFiles,
  removeAttachment,
  send,
  resume,
  stop,
} = useAgentConversation()

const senderRef = ref<any>(null)
const selectedModel = ref<ModelSelection | null>(null)
const messageScroller = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const activePreview = ref<ConversationFilePreview | null>(null)
const previewApprovalSubmitted = ref(false)
const showJumpToLatest = ref(false)
let followBottom = true
let previousScrollHeight = 0

const WELCOME_DESCRIPTION = '从业务目标到数据方案、集成开发、质量验证与交付，让每一个需求都有清晰过程和可复用结果。'
const STARTER_PROMPTS = [
  { icon: '↗', title: '分析数据', description: '发现指标、异常与业务机会', prompt: '分析我上传的数据，识别关键指标、异常和业务机会，并给出可执行结论。' },
  { icon: '◇', title: '搭建流程', description: '形成端到端可验证方案', prompt: '梳理当前数据需求，设计端到端处理流程并生成可验证的交付方案。' },
  { icon: '✓', title: '质量排查', description: '定位问题并验证修复结果', prompt: '检查数据链路中的质量问题，定位根因并给出修复与验证步骤。' },
]

type PresentationItem =
  | { kind: 'message'; key: string; message: Message }
  | { kind: 'process'; key: string; messages: Message[] }

function messageText(message: Message) {
  const content = (message as any).content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((part: any) => part?.type === 'text')
    .map((part: any) => String(part.text ?? part.content ?? ''))
    .join('')
}

function isProcessMessage(message: Message) {
  const raw = message as any
  const role = String(raw.role ?? '')
  if (['reasoning', 'tool', 'activity'].includes(role)) return true
  return role === 'assistant'
    && Array.isArray(raw.toolCalls)
    && raw.toolCalls.length > 0
    && !messageText(message).trim()
}

function isHiddenActivityMessage(message: Message) {
  const raw = message as any
  if (String(raw.role ?? '') !== 'activity' || String(raw.activityType ?? '') !== 'dataagent.task') return false
  const content = raw.content && typeof raw.content === 'object' && !Array.isArray(raw.content)
    ? raw.content
    : {}
  return String(content.status ?? '') === 'completed'
}

const presentationItems = computed<PresentationItem[]>(() => {
  const result: PresentationItem[] = []
  let processMessages: Message[] = []
  const flushProcess = () => {
    if (!processMessages.length) return
    result.push({ kind: 'process', key: `process-${processMessages[0].id}`, messages: processMessages })
    processMessages = []
  }

  for (const message of messages.value) {
    if (isHiddenActivityMessage(message)) continue
    if (isProcessMessage(message)) {
      processMessages.push(message)
      continue
    }
    flushProcess()
    result.push({ kind: 'message', key: `message-${message.id}`, message })
  }
  flushProcess()
  return result
})

const currentRunMessageIds = computed(() => {
  if (!running.value) return new Set<string>()
  let latestUserIndex = -1
  for (let index = messages.value.length - 1; index >= 0; index -= 1) {
    if (messages.value[index].role === 'user') {
      latestUserIndex = index
      break
    }
  }
  return new Set(messages.value.slice(latestUserIndex + 1).map(message => message.id))
})

function isRunningProcess(processMessages: Message[]) {
  return running.value && processMessages.some(message => currentRunMessageIds.value.has(message.id))
}

const activeReasoningId = computed(() => {
  if (!running.value) return ''
  let latestUserIndex = -1
  for (let index = messages.value.length - 1; index >= 0; index -= 1) {
    if (messages.value[index].role === 'user') {
      latestUserIndex = index
      break
    }
  }
  for (let index = messages.value.length - 1; index > latestUserIndex; index -= 1) {
    const message = messages.value[index]
    if (message.role === 'reasoning') return message.id
  }
  return ''
})

const previewInterrupts = computed(() => {
  const interruptId = activePreview.value?.approvalInterruptId
  if (!interruptId) return []
  return pendingInterrupts.value.filter(interrupt => interrupt.id === interruptId)
})

const composerInterrupts = computed(() => {
  const previewIds = new Set(previewInterrupts.value.map(interrupt => interrupt.id))
  return pendingInterrupts.value.filter(interrupt => !previewIds.has(interrupt.id))
})

function scrollToBottom() {
  void nextTick().then(() => {
    const element = messageScroller.value
    if (!element) return
    element.scrollTop = element.scrollHeight
    followBottom = true
    showJumpToLatest.value = false
  })
}

async function handleScroll() {
  const element = messageScroller.value
  if (!element) return
  followBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 5 * 16
  showJumpToLatest.value = !followBottom && Boolean(messages.value.length)
  if (element.scrollTop > 6 * 16 || !nextCursor.value || loadingOlder.value) return
  previousScrollHeight = element.scrollHeight
  await loadOlder()
  await nextTick()
  element.scrollTop += Math.max(0, element.scrollHeight - previousScrollHeight)
}

function chooseFiles() {
  if (!running.value && !pendingInterrupts.value.length) fileInput.value?.click()
}

function onFilesSelected(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files?.length) stageFiles(target.files)
  target.value = ''
}

async function submit() {
  const text = String(senderRef.value?.getModelValue?.()?.text ?? '').trim()
  if (!selectedModel.value) {
    ElMessage.warning('模型尚未加载完成')
    return
  }
  if (!text && !attachments.value.length) return
  try {
    followBottom = true
    const prepared = await send(text, selectedModel.value)
    senderRef.value?.clear?.()
    if (prepared?.created) {
      emit('materialized', prepared.sessionId, prepared.initialName ?? '新需求')
    }
    emit('changed')
    scrollToBottom()
  } catch (reason) {
    ElMessage.error(reason instanceof Error ? reason.message : String(reason))
  }
}

async function resumeRun(entries: ResumeEntry[]) {
  try {
    await resume(entries)
    emit('changed')
    return true
  } catch (reason) {
    ElMessage.error(reason instanceof Error ? reason.message : String(reason))
    return false
  }
}

function useStarterPrompt(prompt: string) {
  senderRef.value?.setText?.(prompt)
  void nextTick(() => senderRef.value?.focus?.('last'))
}

function openFilePreview(file: ConversationFilePreview) {
  activePreview.value = file
  previewApprovalSubmitted.value = false
}

function closeFilePreview() {
  activePreview.value = null
  previewApprovalSubmitted.value = false
}

async function resumeFileApproval(entries: ResumeEntry[]) {
  if (await resumeRun(entries)) previewApprovalSubmitted.value = true
}

async function stopRun() {
  try {
    await stop()
  } catch (reason) {
    ElMessage.error(`对话已停止显示，但后端中断失败：${reason instanceof Error ? reason.message : String(reason)}`)
  }
}

watch(() => props.sessionId, id => {
  if ((id ?? '') === threadId.value) return
  closeFilePreview()
  selectedModel.value = null
  void open(id ?? '')
}, { immediate: true })

watch(messages, () => {
  if (followBottom) scrollToBottom()
}, { deep: true })

watch(error, value => {
  if (value) ElMessage.warning(value)
})

onMounted(scrollToBottom)
onBeforeUnmount(() => {
  fileInput.value = null
})
</script>

<template>
  <section class="agent-chat-layout" :class="{ 'agent-chat-layout--preview': activePreview }">
  <section class="agent-chat" :class="{ 'agent-chat--empty': !sessionId && !messages.length }">
    <header v-if="sessionId" class="agent-chat__header">
      <div>
        <small>当前任务</small>
        <b>{{ displayName || '新需求' }}</b>
        <small>{{ sessionId }}</small>
      </div>
      <span :class="{ active: running }"><i></i>{{ running ? '执行中' : '已就绪' }}</span>
    </header>

    <div
      ref="messageScroller"
      class="agent-chat__messages"
      @scroll.passive="handleScroll"
    >
      <div v-if="hydrating" class="agent-chat__loading">
        <el-skeleton :rows="6" animated />
      </div>

      <div v-else-if="!messages.length" class="agent-welcome">
        <div class="agent-welcome__brand">
          <span class="agent-welcome__eyebrow">DATA DELIVERY WORKSPACE</span>
          <div class="agent-welcome__title">
            <AgentMark />
            <h1>DATA AGENT</h1>
          </div>
          <Welcome
            variant="borderless"
            :description="WELCOME_DESCRIPTION"
          />
          <div class="starter-prompts" aria-label="常用需求模板">
            <button
              v-for="item in STARTER_PROMPTS"
              :key="item.title"
              type="button"
              @click="useStarterPrompt(item.prompt)"
            >
              <span aria-hidden="true">{{ item.icon }}</span>
              <b>{{ item.title }}</b>
              <small>{{ item.description }}</small>
            </button>
          </div>
        </div>
      </div>

      <div v-else class="message-list">
        <div v-if="nextCursor" class="load-older">
          <el-button text :loading="loadingOlder" @click="loadOlder">加载更早消息</el-button>
        </div>
        <template v-for="item in presentationItems" :key="item.key">
          <ConversationProcessGroup
            v-if="item.kind === 'process'"
            :messages="item.messages"
            :running="isRunningProcess(item.messages)"
            :active-reasoning-id="activeReasoningId"
            @preview="openFilePreview"
          />
          <ConversationMessage
            v-else
            :message="item.message"
            :running="running && item.message.id === activeReasoningId"
            @preview="openFilePreview"
          />
        </template>
      </div>
    </div>

    <Transition name="jump-latest">
      <button v-if="showJumpToLatest" class="jump-latest" type="button" @click="scrollToBottom">
        <span aria-hidden="true">↓</span> 回到最新
      </button>
    </Transition>

    <div class="agent-chat__composer-wrap">
      <InterruptCard
        v-if="composerInterrupts.length"
        :interrupts="composerInterrupts"
        :busy="running"
        @resume="resumeRun"
      />

      <div class="agent-chat__composer">
        <div v-if="attachments.length" class="attachment-queue">
          <div v-for="item in attachments" :key="item.id" class="attachment-chip">
            <span>{{ item.file.name }}</span>
            <small>{{ Math.max(1, Math.ceil(item.file.size / 1024)) }} KB</small>
            <button type="button" aria-label="移除附件" @click="removeAttachment(item.id)">×</button>
          </div>
        </div>

        <XSender
          ref="senderRef"
          variant="updown"
          :loading="running"
          :disabled="Boolean(pendingInterrupts.length)"
          placeholder="描述你的数据需求或业务目标"
          :custom-style="{ maxHeight: '10rem' }"
          @submit="submit"
          @cancel="stopRun"
        >
          <template #prefix>
            <div class="composer-input-actions">
              <el-button
                text
                :disabled="running || Boolean(pendingInterrupts.length)"
                @click="chooseFiles"
              >添加文件</el-button>
              <ModelSelector
                :session-id="sessionId"
                :draft="!sessionId"
                :disabled="running || Boolean(pendingInterrupts.length)"
                @selected="selectedModel = $event"
              />
            </div>
          </template>
        </XSender>

        <input
          ref="fileInput"
          class="file-input"
          type="file"
          multiple
          @change="onFilesSelected"
        />
        <div class="composer-assurance">
          <span><i></i> DATA AGENT WORKFLOW</span>
          <small>Agent 可能调用工具，请核对关键交付结果</small>
        </div>
      </div>
    </div>
  </section>

  <FilePreviewPanel
    v-if="activePreview"
    :file="activePreview"
    :interrupts="previewInterrupts"
    :busy="running"
    :approval-submitted="previewApprovalSubmitted"
    @close="closeFilePreview"
    @resume="resumeFileApproval"
  />
  </section>
</template>

<style scoped>
.agent-chat-layout { display: grid; grid-template-columns: minmax(0, 1fr); width: 100%; height: 100%; min-height: 0; overflow: hidden; transition: grid-template-columns 220ms ease; }
.agent-chat-layout--preview { grid-template-columns: minmax(28rem, 1fr) clamp(22rem, 38vw, 36rem); }
.agent-chat { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr) auto; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; background: var(--da-surface-0); }
.agent-chat--empty { grid-template-rows: auto auto; align-content: center; gap: var(--da-space-6); padding-block: var(--da-space-8); }
.agent-chat__header { display: flex; align-items: center; justify-content: space-between; gap: var(--da-space-4); min-height: 3.75rem; padding: 0 var(--da-space-6); border-bottom: 0.0625rem solid var(--da-border); background: color-mix(in srgb, var(--da-surface-0) 88%, transparent); }
.agent-chat__header > div { min-width: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 0 var(--da-space-3); }
.agent-chat__header > div > small:first-child { display: block; grid-row: 1; color: var(--da-accent-primary); font-size: 0.625rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.agent-chat__header > div > b { grid-row: 2; }
.agent-chat__header b { overflow: hidden; color: var(--da-text-emphasis); text-overflow: ellipsis; white-space: nowrap; }
.agent-chat__header > div > small:last-child { display: none; }
.agent-chat__header > span { display: inline-flex; flex: 0 0 auto; align-items: center; gap: var(--da-space-2); color: var(--da-text-muted); font-size: var(--da-font-size-xs); white-space: nowrap; }
.agent-chat__header > span i { width: 0.375rem; height: 0.375rem; border-radius: 50%; background: var(--da-accent-green); }
.agent-chat__header > span.active i { background: var(--da-accent-orange); box-shadow: 0 0 0.75rem var(--da-accent-orange-glow); }
.agent-chat__messages { min-height: 0; overflow: auto; padding: var(--da-space-6) clamp(1rem, 4vw, 3.5rem) var(--da-space-8); scrollbar-gutter: stable; }
.agent-chat__loading, .message-list, .agent-welcome { width: min(100%, var(--da-content-max)); margin: 0 auto; }
.message-list { display: flex; flex-direction: column; gap: var(--da-space-5); }
.load-older { display: flex; justify-content: center; min-height: 2.25rem; }
.agent-welcome { display: flex; min-height: 100%; align-items: center; justify-content: center; padding: var(--da-space-10) 0; }
.agent-welcome__brand { display: flex; width: min(100%, 64rem); flex-direction: column; align-items: center; gap: var(--da-space-3); text-align: center; }
.agent-welcome__eyebrow { color: var(--da-brand-cyan); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.16em; }
.agent-welcome__title { display: flex; align-items: center; justify-content: center; gap: var(--da-space-4); }
.agent-welcome__title h1 { margin: 0; color: var(--da-text-emphasis); font-size: var(--da-font-size-hero); font-weight: 600; letter-spacing: -0.035em; }
.agent-welcome :deep(.elx-welcome) { width: 100%; min-width: 0; justify-content: center; padding: 0; --elx-welcome-filled-bg: transparent; --elx-welcome-filled-border: transparent; --elx-welcome-description-color: var(--da-text-muted); background: transparent; }
.agent-welcome :deep(.elx-welcome__content) { flex: 0 1 auto; }
.agent-welcome :deep(.elx-welcome__description) { font-size: var(--da-font-size-md); line-height: 1.75; text-align: center; white-space: nowrap; }
.starter-prompts { display: grid; width: min(100%, 46rem); grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--da-space-3); margin-top: var(--da-space-5); }
.starter-prompts button { position: relative; display: grid; min-width: 0; gap: 0.25rem; padding: var(--da-space-4); border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-lg); color: var(--da-text-muted); background: color-mix(in srgb, var(--da-surface-2) 72%, transparent); cursor: pointer; text-align: left; transition: transform 180ms ease, border-color 180ms ease, color 180ms ease, background-color 180ms ease, box-shadow 180ms ease; }
.starter-prompts button > span { position: absolute; top: var(--da-space-3); right: var(--da-space-3); color: var(--da-brand-cyan); font-size: var(--da-font-size-sm); transition: transform 180ms ease; }
.starter-prompts button b { color: var(--da-text-primary); font-size: var(--da-font-size-sm); font-weight: 600; }
.starter-prompts button small { overflow: hidden; font-size: var(--da-font-size-xs); line-height: 1.5; text-overflow: ellipsis; white-space: nowrap; }
.starter-prompts button:hover { border-color: color-mix(in srgb, var(--da-accent-primary) 38%, var(--da-border)); color: var(--da-text-secondary); background: var(--da-surface-2); box-shadow: 0 0.75rem 2rem var(--da-brand-glow); transform: translateY(-0.125rem); }
.starter-prompts button:hover > span { transform: translate(0.125rem, -0.125rem); }
.starter-prompts button:active { transform: translateY(0); }
.jump-latest { position: absolute; z-index: 4; bottom: 7.25rem; left: 50%; display: inline-flex; min-height: 2rem; align-items: center; gap: var(--da-space-2); padding: 0 var(--da-space-3); border: 0.0625rem solid var(--da-border-strong); border-radius: 999rem; color: var(--da-text-secondary); background: color-mix(in srgb, var(--da-surface-2) 92%, transparent); box-shadow: var(--da-shadow-card); cursor: pointer; font-size: var(--da-font-size-xs); transform: translateX(-50%); backdrop-filter: blur(0.75rem); }
.jump-latest:hover { border-color: var(--da-border-focus); color: var(--da-text-emphasis); }
.jump-latest-enter-active, .jump-latest-leave-active { transition: opacity 160ms ease, transform 160ms ease; }
.jump-latest-enter-from, .jump-latest-leave-to { opacity: 0; transform: translate(-50%, 0.5rem); }
.agent-chat__composer-wrap { z-index: 2; min-width: 0; padding: 0 clamp(1rem, 4vw, 3.5rem) var(--da-space-5); background: linear-gradient(180deg, transparent, var(--da-surface-0) 20%); }
.agent-chat__composer { width: min(100%, var(--da-content-max)); min-width: 0; margin: 0 auto; }
.agent-chat--empty .agent-chat__messages { overflow: visible; padding-block: 0; }
.agent-chat--empty .agent-welcome { min-height: 0; padding: 0; }
.agent-chat--empty .agent-chat__composer-wrap { padding-bottom: 0; background: transparent; }
.agent-chat__composer :deep(.elx-x-sender .elx-x-sender__content.elx-x-sender__content--variant-updown .elx-x-sender__updown-action-list .elx-x-sender__prefix) { min-width: 0; flex: 1; padding-right: 0; }
.composer-input-actions { display: flex; width: 100%; min-width: 0; align-items: center; gap: var(--da-space-2); }
.composer-input-actions :deep(.model-selector) { margin-left: auto; }
.attachment-queue { display: flex; flex-wrap: wrap; gap: var(--da-space-2); margin-bottom: var(--da-space-2); }
.attachment-chip { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: var(--da-space-2); max-width: 24rem; padding: var(--da-space-2) var(--da-space-3); border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-md); background: var(--da-surface-2); }
.attachment-chip span { overflow: hidden; color: var(--da-text-primary); font-size: var(--da-font-size-sm); text-overflow: ellipsis; white-space: nowrap; }
.attachment-chip small { color: var(--da-text-muted); font-size: var(--da-font-size-xs); }
.attachment-chip button { width: 1.5rem; height: 1.5rem; padding: 0; border: 0; border-radius: 50%; color: var(--da-text-muted); background: transparent; cursor: pointer; }
.attachment-chip button:hover { color: var(--da-text-emphasis); background: var(--da-surface-3); }
.file-input { display: none; }
.composer-assurance { display: flex; align-items: center; justify-content: space-between; gap: var(--da-space-3); padding: var(--da-space-2) var(--da-space-2) 0; color: var(--da-text-subtle); font-size: 0.6875rem; }
.composer-assurance span { display: inline-flex; align-items: center; gap: var(--da-space-2); color: var(--da-text-muted); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-weight: 600; letter-spacing: 0.06em; }
.composer-assurance i { width: 0.3125rem; height: 0.3125rem; border-radius: 50%; background: var(--da-accent-green); box-shadow: 0 0 0.5rem var(--da-accent-green-soft); }
.composer-assurance small { color: inherit; font-size: inherit; }
.agent-chat__composer :deep(.x-sender), .agent-chat__composer :deep(.elx-xsender), .agent-chat__composer :deep(.elx-x-sender) { border-color: var(--da-border-strong); background: var(--da-surface-1); box-shadow: var(--da-shadow-soft); }
.agent-chat__composer :deep([contenteditable='true']), .agent-chat__composer :deep(.chat-write-wrap), .agent-chat__composer :deep(.chat-write-input) { color: var(--da-text-primary); caret-color: var(--da-text-emphasis); }
.agent-chat-layout--preview .agent-chat__header small { display: none; }

@media (max-width: 48rem) {
  .agent-chat-layout--preview { position: relative; display: block; }
  .agent-chat-layout--preview > :deep(.file-preview-panel) { position: absolute; inset: 0; z-index: 10; }
  .agent-chat__header { padding-inline: var(--da-space-4); }
  .agent-chat__header small { display: none; }
  .agent-chat__messages { padding-inline: var(--da-space-4); }
  .agent-chat__composer-wrap { padding-inline: var(--da-space-4); }
  .composer-input-actions :deep(.model-selector) { width: min(9rem, 48vw); }
  .composer-assurance small { display: none; }
  .starter-prompts { grid-template-columns: 1fr; }
  .starter-prompts button { padding-block: var(--da-space-3); }
}

@media (max-width: 72rem) {
  .agent-welcome :deep(.elx-welcome__description) { white-space: normal; }
}

@media (prefers-reduced-motion: reduce) {
  .starter-prompts button, .starter-prompts button > span,
  .jump-latest-enter-active, .jump-latest-leave-active { transition: none; }
}
</style>
