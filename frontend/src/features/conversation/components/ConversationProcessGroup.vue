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
  return total + (['reasoning', 'tool', 'activity'].includes(String(raw.role ?? '')) ? 1 : 0)
}, 0))

function stepTone(message: Message, index: number) {
  const raw = message as any
  const content = raw.content && typeof raw.content === 'object' && !Array.isArray(raw.content)
    ? raw.content
    : {}
  const status = String(content.status ?? '')
  if (raw.error || ['error', 'failed', 'retry'].includes(status)) return 'error'
  if (props.running && (message.id === props.activeReasoningId || index === props.messages.length - 1)) return 'active'
  return 'done'
}
</script>

<template>
  <section class="process-group" :class="{ 'process-group--running': running }" aria-label="执行过程">
    <header class="process-group__header">
      <span class="process-group__mark" aria-hidden="true"><i></i><i></i><i></i></span>
      <span>{{ running ? '正在执行' : '执行过程' }}</span>
      <small>{{ stepCount ? `${stepCount} 个步骤` : '准备中' }}</small>
    </header>

    <div class="process-group__timeline">
      <div
        v-for="(message, index) in messages"
        :key="message.id"
        class="process-step"
        :class="`process-step--${stepTone(message, index)}`"
      >
        <span class="process-step__rail" aria-hidden="true">
          <i></i>
        </span>
        <div class="process-step__content">
          <ConversationMessage
            :message="message"
            :running="running && message.id === activeReasoningId"
            @preview="emit('preview', $event)"
          />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.process-group {
  width: min(100%, 48rem);
  padding: var(--da-space-2) 0 var(--da-space-1);
}

.process-group__header {
  display: flex;
  min-height: 2rem;
  align-items: center;
  gap: var(--da-space-2);
  color: var(--da-text-secondary);
  font-size: var(--da-font-size-sm);
  font-weight: 550;
}

.process-group__header small {
  color: var(--da-text-subtle);
  font-size: var(--da-font-size-xs);
  font-weight: 400;
}

.process-group__mark {
  display: inline-flex;
  width: 1.125rem;
  height: 1.125rem;
  align-items: center;
  justify-content: center;
  gap: 0.125rem;
  border: 0.0625rem solid var(--da-border);
  border-radius: 50%;
  color: var(--da-text-muted);
}

.process-group__mark i {
  width: 0.125rem;
  height: 0.125rem;
  border-radius: 50%;
  background: currentColor;
}

.process-group--running .process-group__mark {
  color: var(--da-accent-orange);
  border-color: var(--da-accent-orange-muted);
}

.process-group--running .process-group__mark i {
  animation: process-pulse 1.2s ease-in-out infinite;
}

.process-group--running .process-group__mark i:nth-child(2) { animation-delay: 120ms; }
.process-group--running .process-group__mark i:nth-child(3) { animation-delay: 240ms; }

.process-group__timeline {
  display: grid;
  margin-top: var(--da-space-1);
  padding-left: 0.1875rem;
}

.process-step {
  position: relative;
  display: grid;
  grid-template-columns: 1.5rem minmax(0, 1fr);
  min-width: 0;
}

.process-step__rail {
  position: relative;
  display: flex;
  justify-content: center;
  min-height: 2rem;
}

.process-step__rail::after {
  position: absolute;
  top: 1.125rem;
  bottom: -0.125rem;
  width: 0.0625rem;
  background: var(--da-border);
  content: '';
}

.process-step:last-child .process-step__rail::after { display: none; }

.process-step__rail i {
  position: relative;
  z-index: 1;
  width: 0.5rem;
  height: 0.5rem;
  margin-top: 0.5rem;
  border: 0.125rem solid var(--da-surface-0);
  border-radius: 50%;
  background: var(--da-border-focus);
  box-shadow: 0 0 0 0.0625rem var(--da-border);
}

.process-step--done .process-step__rail i { background: var(--da-accent-green); }
.process-step--error .process-step__rail i { background: var(--da-accent-red); }
.process-step--active .process-step__rail i {
  background: var(--da-accent-orange);
  box-shadow: 0 0 0 0.0625rem var(--da-accent-orange-muted), 0 0 0.75rem var(--da-accent-orange-glow);
}

.process-step__content {
  min-width: 0;
  padding: 0 0 var(--da-space-2) var(--da-space-1);
}

.process-step__content :deep(.message-bubble),
.process-step__content :deep(.reasoning-card),
.process-step__content :deep(.tool-result-card),
.process-step__content :deep(.activity-card) {
  width: 100%;
}

.process-step__content :deep(.reasoning-card) {
  padding-left: 0;
}

.process-step__content :deep(.reasoning-card::before),
.process-step__content :deep(.reasoning-node) {
  display: none;
}

.process-step__content :deep(.reasoning-card summary),
.process-step__content :deep(.tool-call summary),
.process-step__content :deep(.tool-result-card summary) {
  min-height: 1.75rem;
  padding: var(--da-space-1) 0;
}

.process-step__content :deep(.activity-card) {
  padding: var(--da-space-2) 0;
  border: 0;
  background: transparent;
}

@keyframes process-pulse {
  0%, 100% { opacity: 0.35; transform: translateY(0); }
  50% { opacity: 1; transform: translateY(-0.125rem); }
}

@media (prefers-reduced-motion: reduce) {
  .process-group--running .process-group__mark i { animation: none; }
}
</style>
