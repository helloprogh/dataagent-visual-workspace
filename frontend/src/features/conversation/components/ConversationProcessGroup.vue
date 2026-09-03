<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Message } from '@ag-ui/client'
import ConversationMessage from './ConversationMessage.vue'
import type { ConversationFilePreview } from '../types/filePreview'
import { toolOutputText, toolDisplayName, type ProcessStep } from '../processPresentation'

const props = defineProps<{
  steps: ProcessStep[]
  running?: boolean
  busy?: boolean
  settled?: boolean
  activeReasoningId?: string
}>()

const emit = defineEmits<{
  preview: [file: ConversationFilePreview]
  continue: [message: Message]
}>()

const stepCount = computed(() => props.steps.length)
const onlyReasoning = computed(() => props.steps.length > 0 && props.steps.every(step => step.kind === 'message' && step.message.role === 'reasoning'))
const reasoningTime = computed(() => {
  if (!onlyReasoning.value) return ''
  const durations = props.steps.map(step => (step.message as any).reasoningDurationMs)
  if (!durations.every(duration => typeof duration === 'number' && Number.isFinite(duration))) return ''
  const total = durations.reduce((sum, duration) => sum + duration, 0)
  return total < 1000 ? '少于 1 秒' : `${Math.round(total / 1000)} 秒`
})
const expanded = ref(Boolean(props.running && !props.settled))

watch(() => [props.running, props.settled], ([running, settled]) => {
  expanded.value = Boolean(running && !settled)
})

function toolStatus(step: Extract<ProcessStep, { kind: 'tool' }>) {
  if (step.result) return (step.result as any).error ? '失败' : '已完成'
  return props.running ? '执行中' : '未完成'
}

function toolTarget(step: Extract<ProcessStep, { kind: 'tool' }>) {
  try {
    const args = JSON.parse(step.call.function.arguments || '{}')
    return String(args.path ?? args.filePath ?? args.file_path ?? args.command ?? args.pattern ?? '')
  } catch { return '' }
}
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
      <span>{{ activeReasoningId ? '正在思考' : running ? (onlyReasoning ? '正在组织回答' : '正在执行') : onlyReasoning ? '已思考' : '执行过程' }}</span>
      <small v-if="!onlyReasoning || (!running && reasoningTime)">{{ onlyReasoning ? reasoningTime : stepCount ? `${stepCount} 步` : '准备中' }}</small>
      <span class="process-group__chevron" aria-hidden="true"></span>
    </button>

    <div class="process-group__body" :aria-hidden="!expanded" :inert="!expanded">
      <div class="process-group__steps">
        <div
          v-for="step in steps"
          :key="step.key"
          class="process-step"
          :data-message-id="step.message.id"
        >
          <div class="process-step__content">
            <details
              v-if="step.kind === 'tool'"
              class="process-tool"
              :class="{ 'process-tool--running': running && !step.result }"
              :data-tool-call-id="step.call.id"
            >
              <summary>
                <span class="process-tool__icon" :class="{ 'process-tool__icon--error': (step.result as any)?.error }" aria-hidden="true">›</span>
                <span class="process-tool__name">{{ toolDisplayName(step.call.function.name) }}</span>
                <span v-if="toolTarget(step)" class="process-tool__target" :title="toolTarget(step)">{{ toolTarget(step) }}</span>
                <small class="process-tool__status">{{ toolStatus(step) }}</small>
                <span class="process-group__chevron" aria-hidden="true"></span>
              </summary>
              <div class="process-tool__details">
                <small>输入参数</small>
                <pre>{{ step.call.function.arguments || '{}' }}</pre>
                <template v-if="step.result">
                  <small>{{ (step.result as any).error ? '失败原因' : '执行结果' }}</small>
                  <pre>{{ toolOutputText(step.result) || (step.result as any).error || '执行完成，无文本输出' }}</pre>
                </template>
                <small v-else>{{ running ? '等待执行结果…' : '尚未收到执行结果' }}</small>
              </div>
            </details>
            <ConversationMessage
              v-else
              :message="step.message"
              :running="running && step.message.id === activeReasoningId"
              @preview="emit('preview', $event)"
            />
          </div>
          <button
            v-if="!busy"
            type="button"
            class="process-step__continue"
            title="从此步骤继续"
            @click="emit('continue', step.message)"
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

.process-tool { min-width: 0; color: var(--da-text-muted); font-size: var(--da-font-size-xs); }
.process-tool summary { display: flex; min-height: 1.875rem; align-items: center; gap: var(--da-space-2); padding: var(--da-space-1) var(--da-space-2); border-radius: var(--da-radius-sm); cursor: pointer; list-style: none; transition: background-color 160ms ease; }
.process-tool summary::-webkit-details-marker { display: none; }
.process-tool summary:hover { background: var(--da-surface-2); }
.process-tool__icon { flex: 0 0 auto; color: var(--da-accent-primary); }
.process-tool__icon--error { color: var(--da-accent-red); }
.process-tool__name, .process-tool__status { flex: 0 0 auto; }
.process-tool__target { min-width: 0; overflow: hidden; color: var(--da-text-subtle); text-overflow: ellipsis; white-space: nowrap; }
.process-tool__status { margin-left: auto; color: var(--da-text-subtle); font-size: 0.6875rem; }
.process-tool[open] > summary .process-group__chevron { transform: rotate(90deg); }
.process-tool__details { display: grid; gap: var(--da-space-2); padding: var(--da-space-2); }
.process-tool__details > small { color: var(--da-text-subtle); }
.process-tool__details pre { margin: 0; padding: var(--da-space-3); border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-sm); background: var(--da-surface-code); font-size: inherit; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
.process-tool:not(.process-tool--running) .process-tool__details pre { max-height: 12rem; overflow: auto; }
.process-step:has(.process-step__continue) { padding-right: 4rem; }

@media (hover: none) {
  .process-step__continue { opacity: 1; }
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
