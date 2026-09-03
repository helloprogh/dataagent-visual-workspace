<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Message } from '@ag-ui/client'
import ConversationMessage from './ConversationMessage.vue'
import type { ConversationFilePreview } from '../types/filePreview'

const props = defineProps<{
  messages: Message[]
  running?: boolean
  activeReasoningId?: string
  revealMessageId?: string
}>()

const emit = defineEmits<{
  preview: [file: ConversationFilePreview]
  continue: [message: Message]
}>()

const stepCount = computed(() => props.messages.length)
const expanded = ref(Boolean(props.running))

watch(() => props.running, value => {
  if (value) expanded.value = true
})
watch(() => props.revealMessageId, id => {
  if (props.messages.some(message => message.id === id)) expanded.value = true
})
</script>

<template>
  <section class="process-group" :class="{ 'process-group--running': running, 'process-group--expanded': expanded }">
    <button
      type="button"
      class="process-group__header"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <span class="process-group__mark" aria-hidden="true"><i></i><i></i><i></i></span>
      <span>{{ running ? '正在执行' : '已完成' }}</span>
      <small>{{ stepCount ? `${stepCount} 步` : '准备中' }}</small>
      <span class="process-group__chevron" aria-hidden="true"></span>
    </button>

    <div class="process-group__body" :aria-hidden="!expanded">
      <div class="process-group__steps">
        <div
          v-for="message in messages"
          :key="message.id"
          class="process-step"
          :data-message-id="message.id"
        >
          <div class="process-step__content">
            <ConversationMessage
              :message="message"
              :running="running && message.id === activeReasoningId"
              @preview="emit('preview', $event)"
            />
          </div>
          <button
            v-if="!running"
            type="button"
            class="process-step__continue"
            title="从此步骤继续"
            @click="emit('continue', message)"
          >从此继续</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.process-group {
  width: min(100%, 48rem);
  padding: var(--da-space-1) 0;
}

.process-group__header {
  display: flex;
  width: fit-content;
  min-height: 1.75rem;
  align-items: center;
  gap: var(--da-space-2);
  padding: 0 var(--da-space-1);
  border: 0;
  border-radius: var(--da-radius-sm);
  color: var(--da-text-secondary);
  cursor: pointer;
  font-size: var(--da-font-size-sm);
  font-weight: 550;
  background: transparent;
  transition: color 160ms ease, background-color 160ms ease;
}

.process-group__header:hover { color: var(--da-text-emphasis); background: var(--da-surface-1); }
.process-group:not(.process-group--running) .process-group__mark { color: var(--da-accent-green); border-color: color-mix(in srgb, var(--da-accent-green) 26%, var(--da-border)); }

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

.process-group__chevron {
  position: relative;
  width: 0.75rem;
  height: 0.75rem;
  flex: 0 0 auto;
  color: var(--da-text-subtle);
  transition: transform 160ms ease;
}

.process-group__chevron::before {
  position: absolute;
  top: 0.1875rem;
  left: 0.125rem;
  width: 0.3125rem;
  height: 0.3125rem;
  border-top: 0.0625rem solid currentColor;
  border-right: 0.0625rem solid currentColor;
  content: '';
  transform: rotate(45deg);
}

.process-group--expanded > .process-group__header .process-group__chevron { transform: rotate(90deg); }

.process-group__body {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition: grid-template-rows 200ms ease, opacity 160ms ease;
}

.process-group--expanded .process-group__body {
  grid-template-rows: 1fr;
  opacity: 1;
}

.process-group__steps {
  display: grid;
  min-height: 0;
  gap: 0.125rem;
  margin-top: 0.125rem;
  overflow: hidden;
  padding-left: var(--da-space-2);
}

.process-step {
  position: relative;
  min-width: 0;
}

.process-step__continue { position: absolute; top: 0; right: 0; padding: 0.125rem var(--da-space-2); border: 0; border-radius: var(--da-radius-sm); color: var(--da-text-subtle); background: transparent; cursor: pointer; font-size: 0.6875rem; opacity: 0; transition: opacity 140ms ease, color 140ms ease, background-color 140ms ease; }
.process-step:hover .process-step__continue, .process-step__continue:focus-visible { opacity: 1; }
.process-step__continue:hover { color: var(--da-text-emphasis); background: var(--da-surface-2); }

.process-step__content {
  min-width: 0;
  padding: 0 0 var(--da-space-1);
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
  min-height: 1.5rem;
  padding: 0;
}

.process-step__content :deep(.tool-call-list) { gap: 0; margin-top: 0; }
.process-step__content :deep(.reasoning-content) { padding: var(--da-space-2) 0 var(--da-space-1); }
.process-step__content :deep(.tool-call pre),
.process-step__content :deep(.tool-result-card pre) { margin-top: 0; padding-block: var(--da-space-1); }

.process-step__content :deep(.activity-card) {
  min-height: 1.5rem;
  gap: var(--da-space-2);
  padding: 0;
  border: 0;
  background: transparent;
}

@keyframes process-pulse {
  0%, 100% { opacity: 0.35; transform: translateY(0); }
  50% { opacity: 1; transform: translateY(-0.125rem); }
}

@media (prefers-reduced-motion: reduce) {
  .process-group--running .process-group__mark i { animation: none; }
  .process-group__body, .process-group__chevron { transition: none; }
}
</style>
