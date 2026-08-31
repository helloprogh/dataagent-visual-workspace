<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ResumeEntry } from '@ag-ui/client'
import { ElMessage } from 'element-plus'
import { Welcome, XSender } from 'vue-element-plus-x'
import type { ModelSelection } from '../../model/types'
import ModelSelector from '../../model/components/ModelSelector.vue'
import { useAgentConversation } from '../composables/useAgentConversation'
import AgentMark from './AgentMark.vue'
import ConversationMessage from './ConversationMessage.vue'
import InterruptCard from './InterruptCard.vue'

const props = defineProps<{
  sessionId?: string
  displayName?: string
}>()

const emit = defineEmits<{
  materialized: [sessionId: string, displayName: string]
  changed: []
}>()

const {
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

const input = ref('')
const selectedModel = ref<ModelSelection | null>(null)
const messageScroller = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
let followBottom = true
let previousScrollHeight = 0

const WELCOME_DESCRIPTION = '描述你的数据业务目标，我将与你逐步澄清需求，并自主完成 Specification、数据方案、数据集成、ETL 开发、治理验证与交付。'

function scrollToBottom() {
  void nextTick().then(() => {
    const element = messageScroller.value
    if (!element) return
    element.scrollTop = element.scrollHeight
  })
}

async function handleScroll() {
  const element = messageScroller.value
  if (!element) return
  followBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 5rem * 16
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

async function submit(value?: string) {
  const text = (value ?? input.value).trim()
  if (!selectedModel.value) {
    ElMessage.warning('模型尚未加载完成')
    return
  }
  if (!text && !attachments.value.length) return
  try {
    followBottom = true
    const prepared = await send(text, selectedModel.value)
    input.value = ''
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
  } catch (reason) {
    ElMessage.error(reason instanceof Error ? reason.message : String(reason))
  }
}

async function stopRun() {
  try {
    await stop()
  } catch (reason) {
    ElMessage.error(`对话已停止显示，但后端中断失败：${reason instanceof Error ? reason.message : String(reason)}`)
  }
}

watch(() => props.sessionId, id => {
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
  <section class="agent-chat" :class="{ 'agent-chat--empty': !sessionId && !messages.length }">
    <header v-if="sessionId" class="agent-chat__header">
      <div>
        <b>{{ displayName || '新需求' }}</b>
        <small>{{ sessionId }}</small>
      </div>
      <span :class="{ active: running }"><i></i>{{ running ? '执行中' : '在线' }}</span>
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
        <AgentMark />
        <Welcome
          variant="borderless"
          title="DATA AGENT"
          :description="WELCOME_DESCRIPTION"
        />
      </div>

      <div v-else class="message-list">
        <div v-if="nextCursor" class="load-older">
          <el-button text :loading="loadingOlder" @click="loadOlder">加载更早消息</el-button>
        </div>
        <ConversationMessage
          v-for="message in messages"
          :key="message.id"
          :message="message"
          :running="running"
        />
      </div>
    </div>

    <div class="agent-chat__composer-wrap">
      <InterruptCard
        v-if="pendingInterrupts.length"
        :interrupts="pendingInterrupts"
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

        <div class="composer-toolbar">
          <div class="composer-toolbar__left">
            <ModelSelector
              :session-id="sessionId"
              :draft="!sessionId"
              :disabled="running || Boolean(pendingInterrupts.length)"
              @selected="selectedModel = $event"
            />
            <el-button
              text
              :disabled="running || Boolean(pendingInterrupts.length)"
              @click="chooseFiles"
            >添加文件</el-button>
          </div>

          <el-button v-if="running" type="danger" plain @click="stopRun">停止</el-button>
        </div>

        <XSender
          v-model="input"
          variant="updown"
          clearable
          :auto-focus="!sessionId"
          :loading="running"
          :disabled="Boolean(pendingInterrupts.length)"
          placeholder="描述你的数据需求或业务目标"
          :custom-style="{ maxHeight: '10rem' }"
          @submit="submit"
        />

        <input
          ref="fileInput"
          class="file-input"
          type="file"
          multiple
          @change="onFilesSelected"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.agent-chat { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; width: 100%; height: 100%; min-height: 0; background: var(--da-surface-0); }
.agent-chat--empty { grid-template-rows: minmax(0, 1fr) auto; }
.agent-chat__header { display: flex; align-items: center; justify-content: space-between; gap: var(--da-space-4); min-height: 3.75rem; padding: 0 var(--da-space-6); border-bottom: 0.0625rem solid var(--da-border); background: color-mix(in srgb, var(--da-surface-0) 88%, transparent); }
.agent-chat__header > div { min-width: 0; display: flex; align-items: baseline; gap: var(--da-space-3); }
.agent-chat__header b { overflow: hidden; color: var(--da-text-emphasis); text-overflow: ellipsis; white-space: nowrap; }
.agent-chat__header small { overflow: hidden; max-width: 18rem; color: var(--da-text-subtle); font-size: var(--da-font-size-xs); text-overflow: ellipsis; white-space: nowrap; }
.agent-chat__header > span { display: inline-flex; align-items: center; gap: var(--da-space-2); color: var(--da-text-muted); font-size: var(--da-font-size-xs); }
.agent-chat__header > span i { width: 0.375rem; height: 0.375rem; border-radius: 50%; background: var(--da-accent-green); }
.agent-chat__header > span.active i { background: var(--da-accent-orange); box-shadow: 0 0 0.75rem var(--da-accent-orange-glow); }
.agent-chat__messages { min-height: 0; overflow: auto; padding: var(--da-space-6) clamp(1rem, 4vw, 3.5rem) var(--da-space-8); scrollbar-gutter: stable; }
.agent-chat__loading, .message-list, .agent-welcome { width: min(100%, var(--da-content-max)); margin: 0 auto; }
.message-list { display: flex; flex-direction: column; gap: var(--da-space-5); }
.load-older { display: flex; justify-content: center; min-height: 2.25rem; }
.agent-welcome { display: flex; min-height: 100%; flex-direction: column; align-items: center; justify-content: center; gap: var(--da-space-5); padding: var(--da-space-10) 0; text-align: center; }
.agent-welcome :deep(.welcome) { width: 100%; max-width: 44rem; padding: 0; background: transparent; }
.agent-welcome :deep(.welcome-title) { color: var(--da-text-emphasis); font-size: var(--da-font-size-hero); font-weight: 600; letter-spacing: -0.035em; }
.agent-welcome :deep(.welcome-description) { color: var(--da-text-muted); font-size: var(--da-font-size-md); line-height: 1.75; }
.agent-chat__composer-wrap { z-index: 2; padding: 0 clamp(1rem, 4vw, 3.5rem) var(--da-space-5); background: linear-gradient(180deg, transparent, var(--da-surface-0) 20%); }
.agent-chat__composer { width: min(100%, var(--da-content-max)); margin: 0 auto; }
.composer-toolbar { display: flex; align-items: center; justify-content: space-between; gap: var(--da-space-3); margin-bottom: var(--da-space-2); }
.composer-toolbar__left { display: flex; align-items: center; gap: var(--da-space-2); min-width: 0; }
.attachment-queue { display: flex; flex-wrap: wrap; gap: var(--da-space-2); margin-bottom: var(--da-space-2); }
.attachment-chip { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: var(--da-space-2); max-width: 24rem; padding: var(--da-space-2) var(--da-space-3); border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-md); background: var(--da-surface-2); }
.attachment-chip span { overflow: hidden; color: var(--da-text-primary); font-size: var(--da-font-size-sm); text-overflow: ellipsis; white-space: nowrap; }
.attachment-chip small { color: var(--da-text-muted); font-size: var(--da-font-size-xs); }
.attachment-chip button { width: 1.5rem; height: 1.5rem; padding: 0; border: 0; border-radius: 50%; color: var(--da-text-muted); background: transparent; cursor: pointer; }
.attachment-chip button:hover { color: var(--da-text-emphasis); background: var(--da-surface-3); }
.file-input { display: none; }
.agent-chat__composer :deep(.x-sender), .agent-chat__composer :deep(.elx-xsender) { border-color: var(--da-border-strong); background: var(--da-surface-1); box-shadow: var(--da-shadow-soft); }

@media (max-width: 48rem) {
  .agent-chat__header { padding-inline: var(--da-space-4); }
  .agent-chat__header small { display: none; }
  .agent-chat__messages { padding-inline: var(--da-space-4); }
  .agent-chat__composer-wrap { padding-inline: var(--da-space-4); }
  .composer-toolbar { align-items: flex-start; }
  .composer-toolbar__left { flex-wrap: wrap; }
}
</style>
