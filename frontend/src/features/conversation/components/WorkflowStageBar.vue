<script setup lang="ts">
import { WORKFLOW_STAGES, type WorkflowSnapshot, type WorkflowStage } from '../workflow'
defineProps<{ workflow: WorkflowSnapshot; busy?: boolean }>()
const emit = defineEmits<{ select: [stage: WorkflowStage] }>()
const statuses = { idle: '等待需求', requested: '已请求', running: '执行中', recorded: '已有执行记录', waiting: '等待确认', failed: '执行未完成', stopped: '已停止' }
</script>

<template>
  <nav class="workflow-stages" aria-label="对话进度">
    <button
      v-for="stage in WORKFLOW_STAGES"
      :key="stage.id"
      type="button"
      :class="{ active: stage.id === workflow.active, visited: workflow.evidence[stage.id] }"
      :aria-current="stage.id === workflow.active ? 'step' : undefined"
      :disabled="busy && !workflow.evidence[stage.id]"
      :title="workflow.evidence[stage.id] ? `${workflow.evidence[stage.id]?.description}；点击定位` : `准备${stage.label}请求`"
      @click="emit('select', stage.id)"
    ><i></i>{{ stage.label }}</button>
    <small role="status" :class="workflow.status">{{ statuses[workflow.status] }}</small>
  </nav>
</template>

<style scoped>
.workflow-stages { display: flex; min-width: 0; align-items: center; gap: 0.5rem; overflow: auto; }
.workflow-stages button { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 0.375rem; padding: 0.25rem 0.375rem; border: 0; border-radius: var(--da-radius-sm); background: transparent; color: var(--da-text-subtle); font-size: 0.6875rem; white-space: nowrap; cursor: pointer; transition: background-color 150ms ease, color 150ms ease; }
.workflow-stages button:hover:not(:disabled) { color: var(--da-text-emphasis); background: var(--da-surface-2); }
.workflow-stages button:disabled { opacity: 0.5; cursor: default; }
.workflow-stages i { width: 0.375rem; height: 0.375rem; flex: 0 0 auto; border: 0.0625rem solid var(--da-border-strong); border-radius: 50%; background: var(--da-surface-0); }
.workflow-stages .visited { color: var(--da-text-muted); }
.workflow-stages .visited i { border-color: var(--da-text-muted); background: var(--da-text-muted); }
.workflow-stages .active { color: var(--da-text-emphasis); }
.workflow-stages .active i { border-color: var(--da-accent-primary); background: var(--da-accent-primary); box-shadow: 0 0 0.625rem var(--da-accent-primary-soft); }
.workflow-stages small { flex: 0 0 auto; margin-left: 0.5rem; color: var(--da-text-muted); font-size: 0.625rem; white-space: nowrap; }
.workflow-stages small.failed, .workflow-stages small.waiting { color: var(--da-accent-orange); }
@media (prefers-reduced-motion: reduce) { .workflow-stages button { transition: none; } }
</style>
