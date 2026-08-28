<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{
  title?: string
  unit?: string
  stages?: Array<{ label: string; value: number; conversion?: number }>
}>()
const max = computed(() => Math.max(1, ...(props.stages || []).map(item => item.value)))
</script>

<template>
  <section class="gen-card">
    <div class="gen-title-row">
      <div>
        <span class="eyebrow">转化路径</span>
        <span class="gen-title">{{ title || '转化漏斗' }}</span>
      </div>
      <span v-if="unit" class="muted">单位：{{ unit }}</span>
    </div>
    <div class="funnel-list">
      <div v-for="(stage, index) in stages || []" :key="stage.label" class="funnel-row">
        <div class="funnel-meta">
          <span><i>{{ String(index + 1).padStart(2, '0') }}</i>{{ stage.label }}</span>
          <strong>{{ stage.value.toLocaleString() }}</strong>
        </div>
        <div class="funnel-track">
          <div class="funnel-fill" :style="{ width: `${Math.max(8, stage.value / max * 100)}%` }"></div>
        </div>
        <span v-if="stage.conversion !== undefined" class="funnel-conversion">{{ stage.conversion }}%</span>
      </div>
    </div>
  </section>
</template>
