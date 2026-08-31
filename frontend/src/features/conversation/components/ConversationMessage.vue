<script setup lang="ts">
import { computed } from 'vue'
import type { Message } from '@ag-ui/client'
import { Bubble } from 'vue-element-plus-x'
import { MarkdownRenderer } from 'x-markdown-vue'
import { appTheme } from '../../../shared/theme/theme'

const props = defineProps<{ message: Message; running?: boolean }>()
const raw = computed(() => props.message as any)
const role = computed(() => String(raw.value.role ?? ''))

const text = computed(() => {
  const content = raw.value.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((part: any) => part?.type === 'text')
    .map((part: any) => String(part.text ?? part.content ?? ''))
    .join('')
})

const files = computed(() => {
  const content = raw.value.content
  if (!Array.isArray(content)) return []
  return content.filter((part: any) => ['image', 'audio', 'video', 'document', 'file'].includes(part?.type))
})

const toolCalls = computed(() => Array.isArray(raw.value.toolCalls) ? raw.value.toolCalls : [])
const isUser = computed(() => role.value === 'user')
const isAssistant = computed(() => role.value === 'assistant')
const isReasoning = computed(() => role.value === 'reasoning')
const isTool = computed(() => role.value === 'tool')
const isActivity = computed(() => role.value === 'activity')

const activity = computed(() => {
  const content = raw.value.content && typeof raw.value.content === 'object' && !Array.isArray(raw.value.content)
    ? raw.value.content
    : {}
  const type = String(raw.value.activityType ?? '')
  const status = String(content.status ?? '')
  if (type === 'dataagent.task') {
    const labels: Record<string, string> = {
      queued: '任务已进入队列',
      delivered: '请求已送达',
      running: '正在执行任务',
      waiting_permission: '等待你的授权',
      retry: '服务暂时不可用，正在重试',
      completed: '任务执行完成',
    }
    const detail = status === 'waiting_permission'
      ? String(content.permission?.action ? `待授权操作：${content.permission.action}` : '确认后继续执行')
      : status === 'retry'
        ? String(content.attempt ? `第 ${content.attempt} 次重试` : '')
        : ''
    return { title: labels[status] ?? '任务状态已更新', detail, tone: status === 'retry' ? 'warning' : status === 'completed' ? 'success' : 'active' }
  }
  if (type === 'dataagent.tool') {
    const name = String(content.name ?? '工具')
    return {
      title: status === 'completed' ? `${name} 执行完成` : status === 'error' ? `${name} 执行失败` : `${name} 正在执行`,
      detail: '',
      tone: status === 'error' ? 'warning' : status === 'completed' ? 'success' : 'active',
    }
  }
  return { title: '运行状态已更新', detail: '', tone: 'active' }
})
</script>

<template>
  <Bubble
    v-if="isUser"
    placement="end"
    variant="filled"
    shape="corner"
    avatar-size="0rem"
    avatar-gap="0rem"
    class="message-bubble message-bubble--user"
  >
    <template #content>
      <div class="user-content">
        <p v-if="text">{{ text }}</p>
        <div v-if="files.length" class="attachment-list">
          <a
            v-for="(file, index) in files"
            :key="index"
            :href="file.source?.value"
            target="_blank"
            rel="noreferrer"
          >{{ file.metadata?.filename || `附件 ${index + 1}` }}</a>
        </div>
      </div>
    </template>
  </Bubble>

  <Bubble
    v-else-if="isAssistant"
    placement="start"
    variant="borderless"
    avatar-size="0rem"
    avatar-gap="0rem"
    class="message-bubble message-bubble--assistant"
  >
    <template #content>
      <div class="assistant-content">
        <MarkdownRenderer
          v-if="text"
          :markdown="text"
          :sanitize="true"
          :is-dark="appTheme === 'dark'"
        />
        <div v-if="toolCalls.length" class="tool-call-list">
          <details v-for="call in toolCalls" :key="call.id" class="tool-call">
            <summary>{{ call.function?.name || 'Tool' }}</summary>
            <pre>{{ call.function?.arguments || '{}' }}</pre>
          </details>
        </div>
      </div>
    </template>
  </Bubble>

  <section v-else-if="isReasoning" class="reasoning-card">
    <details :open="Boolean(running)">
      <summary><span class="reasoning-dot"></span>{{ running ? '正在思考' : '思考过程' }}</summary>
      <div class="reasoning-content">{{ text }}</div>
    </details>
  </section>

  <details v-else-if="isTool" class="tool-result-card">
    <summary>{{ raw.error ? '工具执行失败' : '工具结果' }}</summary>
    <pre>{{ text }}</pre>
  </details>

  <section v-else-if="isActivity" class="activity-card">
    <i :class="`activity-card__dot activity-card__dot--${activity.tone}`"></i>
    <div>
      <b>{{ activity.title }}</b>
      <small v-if="activity.detail">{{ activity.detail }}</small>
    </div>
  </section>
</template>

<style scoped>
.message-bubble { width: 100%; }
.message-bubble--user { --elx-bubble-bg-color: var(--da-surface-3); }
.message-bubble--assistant :deep(.elx-bubble__content) {
  padding: 0;
  border: 0;
  background: transparent;
}
.user-content { max-width: 38rem; color: var(--da-text-emphasis); }
.user-content p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.attachment-list { display: flex; flex-wrap: wrap; gap: var(--da-space-2); margin-top: var(--da-space-2); }
.attachment-list a { padding: var(--da-space-2) var(--da-space-3); border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-sm); color: var(--da-text-secondary); text-decoration: none; background: var(--da-surface-2); }
.assistant-content { width: min(100%, 48rem); color: var(--da-text-primary); }
.assistant-content :deep(.x-md-renderer) {
  padding: 0 !important;
  color: var(--da-text-primary) !important;
  background: transparent !important;
}
.assistant-content :deep(.x-md-core) { color: inherit; line-height: 1.75; }
.assistant-content :deep(.x-md-core > :first-child) { margin-top: 0; }
.assistant-content :deep(.x-md-core > :last-child) { margin-bottom: 0; }
.tool-call-list { display: grid; gap: var(--da-space-2); margin-top: var(--da-space-3); }
.tool-call, .tool-result-card, .activity-card, .reasoning-card { border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-md); background: var(--da-surface-1); }
.tool-call { padding: var(--da-space-2) var(--da-space-3); }
.tool-call summary { cursor: pointer; color: var(--da-text-secondary); font-size: var(--da-font-size-sm); }
.tool-call pre, .tool-result-card pre { margin: var(--da-space-2) 0 0; overflow: auto; max-height: 18rem; color: var(--da-text-muted); font-size: var(--da-font-size-xs); white-space: pre-wrap; }
.reasoning-card { width: min(100%, 48rem); padding: var(--da-space-3) var(--da-space-4); }
.reasoning-card summary { cursor: pointer; color: var(--da-text-muted); font-size: var(--da-font-size-sm); }
.reasoning-dot { display: inline-block; width: 0.375rem; height: 0.375rem; margin-right: var(--da-space-2); border-radius: 50%; background: var(--da-accent-orange); }
.reasoning-content { padding-top: var(--da-space-3); color: var(--da-text-secondary); font-size: var(--da-font-size-sm); line-height: 1.7; white-space: pre-wrap; }
.tool-result-card, .activity-card { width: min(100%, 48rem); padding: var(--da-space-3) var(--da-space-4); }
.tool-result-card summary { cursor: pointer; color: var(--da-text-secondary); font-size: var(--da-font-size-sm); }
.activity-card { display: flex; align-items: center; gap: var(--da-space-3); }
.activity-card__dot { width: 0.5rem; height: 0.5rem; flex: 0 0 auto; border-radius: 50%; background: var(--da-text-subtle); }
.activity-card__dot--active { background: var(--da-accent-blue); box-shadow: 0 0 0.75rem color-mix(in srgb, var(--da-accent-blue) 45%, transparent); }
.activity-card__dot--warning { background: var(--da-accent-orange); }
.activity-card__dot--success { background: var(--da-accent-green); }
.activity-card div { display: grid; gap: var(--da-space-1); }
.activity-card b { color: var(--da-text-secondary); font-size: var(--da-font-size-sm); font-weight: 500; }
.activity-card small { color: var(--da-text-muted); font-size: var(--da-font-size-xs); }
</style>
