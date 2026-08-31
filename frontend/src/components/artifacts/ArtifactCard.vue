<script setup lang="ts">
import { computed } from 'vue'
import { artifactController } from '../../artifacts/store'
import type { ArtifactReference } from '../../artifacts/types'

const props = defineProps<{ artifact: ArtifactReference }>()

const label = computed(() => {
  const labels: Record<string, string> = {
    spec: 'Spec',
    report: '分析报告',
    sql: 'SQL',
    dataset: '数据集',
    chart: '图表',
    file: '文件',
    'file-package': '文件包',
    markdown: 'Markdown',
    log: '执行日志',
  }
  return labels[props.artifact.artifactType] ?? props.artifact.artifactType
})

const statusText = computed(() => {
  const statuses: Record<string, string> = {
    generating: '生成中',
    completed: '已完成',
    reviewing: '待确认',
    approved: '已确认',
    error: '生成失败',
  }
  return props.artifact.status ? (statuses[props.artifact.status] ?? props.artifact.status) : ''
})
</script>

<template>
  <button class="artifact-card" type="button" @click="artifactController.open(artifact)">
    <span class="artifact-card__icon" aria-hidden="true">{{ artifact.artifactType === 'spec' ? 'S' : 'A' }}</span>
    <span class="artifact-card__body">
      <span class="artifact-card__meta">
        <b>{{ label }}</b>
        <span v-if="artifact.version">{{ artifact.version }}</span>
        <span v-if="statusText" class="artifact-card__status">{{ statusText }}</span>
      </span>
      <strong>{{ artifact.title }}</strong>
      <small v-if="artifact.summary">{{ artifact.summary }}</small>
    </span>
    <span class="artifact-card__open">打开</span>
  </button>
</template>

<style scoped>
.artifact-card{width:min(100%,620px);display:grid;grid-template-columns:38px minmax(0,1fr) auto;align-items:center;gap:12px;padding:13px 14px;border:1px solid var(--da-border);border-radius:12px;background:var(--da-surface-1);color:var(--da-text-primary);text-align:left;cursor:pointer;transition:border-color .16s ease,background .16s ease}
.artifact-card:hover{border-color:var(--da-border-strong);background:var(--da-surface-2)}
.artifact-card:focus-visible{outline:2px solid var(--da-border-focus);outline-offset:2px}
.artifact-card__icon{width:38px;height:38px;display:grid;place-items:center;border:1px solid var(--da-border);border-radius:9px;background:var(--da-surface-deep);color:var(--da-text-emphasis);font-size:12px;font-weight:700}
.artifact-card__body{min-width:0;display:flex;flex-direction:column;gap:4px}
.artifact-card__meta{display:flex;align-items:center;gap:8px;color:var(--da-text-subtle);font-size:11px}
.artifact-card__meta b{color:var(--da-text-secondary);font-weight:650}
.artifact-card__status{padding:2px 6px;border-radius:999px;background:color-mix(in srgb,var(--da-accent-cyan) 8%,transparent);color:var(--da-accent-cyan)}
.artifact-card__body strong{overflow:hidden;color:var(--da-text-primary);font-size:14px;font-weight:620;text-overflow:ellipsis;white-space:nowrap}
.artifact-card__body small{overflow:hidden;color:var(--da-text-muted);font-size:12px;text-overflow:ellipsis;white-space:nowrap}
.artifact-card__open{color:var(--da-text-subtle);font-size:12px}
</style>
