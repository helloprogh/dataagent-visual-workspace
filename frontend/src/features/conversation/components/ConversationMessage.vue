<script setup lang="ts">
import { computed } from 'vue'
import type { Message } from '@ag-ui/client'
import { Bubble } from 'vue-element-plus-x'
import { MarkdownRenderer } from 'x-markdown-vue'

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
        <MarkdownRenderer v-if="text" :markdown="text" :sanitize="true" />
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

  <section v-else-if="isTool" class="tool-result-card">
    <header>Tool Result</header>
    <pre>{{ text }}</pre>
  </section>

  <section v-else-if="isActivity" class="activity-card">
    <span>{{ raw.activityType || 'Activity' }}</span>
    <pre>{{ JSON.stringify(raw.content ?? {}, null, 2) }}</pre>
  </section>
</template>

<style scoped>
.message-bubble { width: 100%; }
.message-bubble--user { --elx-bubble-bg-color: var(--da-surface-3); }
.user-content { max-width: 38rem; color: var(--da-text-emphasis); }
.user-content p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.attachment-list { display: flex; flex-wrap: wrap; gap: var(--da-space-2); margin-top: var(--da-space-2); }
.attachment-list a { padding: var(--da-space-2) var(--da-space-3); border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-sm); color: var(--da-text-secondary); text-decoration: none; background: var(--da-surface-2); }
.assistant-content { width: min(100%, 48rem); color: var(--da-text-primary); }
.tool-call-list { display: grid; gap: var(--da-space-2); margin-top: var(--da-space-3); }
.tool-call, .tool-result-card, .activity-card, .reasoning-card { border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-md); background: var(--da-surface-1); }
.tool-call { padding: var(--da-space-2) var(--da-space-3); }
.tool-call summary { cursor: pointer; color: var(--da-text-secondary); font-size: var(--da-font-size-sm); }
.tool-call pre, .tool-result-card pre, .activity-card pre { margin: var(--da-space-2) 0 0; overflow: auto; color: var(--da-text-muted); font-size: var(--da-font-size-xs); white-space: pre-wrap; }
.reasoning-card { width: min(100%, 48rem); padding: var(--da-space-3) var(--da-space-4); }
.reasoning-card summary { cursor: pointer; color: var(--da-text-muted); font-size: var(--da-font-size-sm); }
.reasoning-dot { display: inline-block; width: 0.375rem; height: 0.375rem; margin-right: var(--da-space-2); border-radius: 50%; background: var(--da-accent-orange); }
.reasoning-content { padding-top: var(--da-space-3); color: var(--da-text-secondary); font-size: var(--da-font-size-sm); line-height: 1.7; white-space: pre-wrap; }
.tool-result-card, .activity-card { width: min(100%, 48rem); padding: var(--da-space-3) var(--da-space-4); }
.tool-result-card header, .activity-card > span { color: var(--da-text-muted); font-size: var(--da-font-size-xs); text-transform: uppercase; letter-spacing: 0.04em; }
</style>
