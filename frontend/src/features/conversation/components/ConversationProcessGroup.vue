<script setup lang="ts">
import { computed } from 'vue'
import type { Message } from '@ag-ui/client'
import ConversationMessage from './ConversationMessage.vue'
import type { ConversationFilePreview } from '../types/filePreview'

const props = defineProps<{
  messages: Message[]
  running?: boolean
  activeReasoningId?: string
}>()

const emit = defineEmits<{ preview: [file: ConversationFilePreview] }>()

const stepCount = computed(() => props.messages.reduce((total, message) => {
  const raw = message as any
  if (raw.role === 'assistant' && Array.isArray(raw.toolCalls)) {
    return total + Math.max(1, raw.toolCalls.length)
  }
  return total + (['reasoning', 'tool'].includes(String(raw.role ?? '')) ? 1 : 0)
}, 0))
</script>

<template>
  <details class="process-group" :class="{ 'process-group--running': running }" :open="Boolean(running)">
    <summary>
      <span class="process-group__mark" aria-hidden="true"><i></i><i></i><i></i></span>
      <span>{{ running ? '正在执行' : '执行过程' }}</span>
      <small>{{ stepCount ? `${stepCount} 个步骤` : '准备中' }}</small>
      <span class="process-group__chevron" aria-hidden="true"></span>
    </summary>
    <div class="process-group__content">
      <ConversationMessage
        v-for="message in messages"
        :key="message.id"
        :message="message"
        :running="running && message.id === activeReasoningId"
        @preview="emit('preview', $event)"
      />
    </div>
  </details>
</template>

<style scoped>
.process-group { width: min(100%, 48rem); }
.process-group > summary {
  display: flex;
  width: fit-content;
  min-height: 2rem;
  align-items: center;
  gap: var(--da-space-2);
  padding: var(--da-space-1) var(--da-space-2);
  border-radius: var(--da-radius-sm);
  color: var(--da-text-secondary);
  cursor: pointer;
  font-size: var(--da-font-size-sm);
  list-style: none;
  transition: color 160ms ease, background-color 160ms ease;
}
.process-group > summary::-webkit-details-marker { display: none; }
.process-group > summary:hover { color: var(--da-text-emphasis); background: var(--da-surface-1); }
.process-group > summary small { color: var(--da-text-subtle); font-size: var(--da-font-size-xs); }
.process-group__mark { display: inline-flex; width: 1.125rem; height: 1.125rem; align-items: center; justify-content: center; gap: 0.125rem; border: 0.0625rem solid var(--da-border); border-radius: 50%; }
.process-group__mark i { width: 0.125rem; height: 0.125rem; border-radius: 50%; background: currentColor; }
.process-group--running .process-group__mark { color: var(--da-accent-orange); border-color: var(--da-accent-orange-muted); }
.process-group--running .process-group__mark i { animation: process-pulse 1.2s ease-in-out infinite; }
.process-group--running .process-group__mark i:nth-child(2) { animation-delay: 120ms; }
.process-group--running .process-group__mark i:nth-child(3) { animation-delay: 240ms; }
.process-group__chevron { width: 0.375rem; height: 0.375rem; margin-left: 0.125rem; border-right: 0.0625rem solid currentColor; border-bottom: 0.0625rem solid currentColor; transform: rotate(45deg); transition: transform 160ms ease; }
.process-group[open] > summary .process-group__chevron { transform: rotate(225deg); }
.process-group__content { display: grid; gap: 0; padding: 0.125rem 0 var(--da-space-1) var(--da-space-4); }
.process-group__content :deep(.tool-call-list) { margin-top: 0; }
.process-group__content :deep(.tool-call summary), .process-group__content :deep(.tool-result-card summary) { min-height: 1.5rem; padding-block: 0; padding-left: 0; }
.process-group__content :deep(.reasoning-card::before) { display: none; }

@keyframes process-pulse {
  0%, 100% { opacity: 0.35; transform: translateY(0); }
  50% { opacity: 1; transform: translateY(-0.125rem); }
}

@media (prefers-reduced-motion: reduce) {
  .process-group--running .process-group__mark i { animation: none; }
}
</style>
