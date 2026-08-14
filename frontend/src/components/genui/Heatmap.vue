<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{
  title?: string
  xLabels?: string[]
  yLabels?: string[]
  values?: number[][]
  unit?: string
}>()
const flat = computed(() => (props.values || []).flat())
const min = computed(() => Math.min(...flat.value, 0))
const max = computed(() => Math.max(...flat.value, 1))
const range = computed(() => Math.max(1, max.value - min.value))
function alpha(value: number) { return 0.14 + ((value - min.value) / range.value) * 0.76 }
</script>

<template>
  <section class="gen-card heatmap-card">
    <div class="gen-title-row">
      <div><span class="eyebrow">DENSITY</span><span class="gen-title">{{ title || '热力分析' }}</span></div>
      <span v-if="unit" class="muted">{{ unit }}</span>
    </div>
    <div class="heatmap-grid" :style="{ gridTemplateColumns: `90px repeat(${xLabels?.length || 0}, minmax(42px, 1fr))` }">
      <span></span><b v-for="x in xLabels || []" :key="x" class="heat-x">{{ x }}</b>
      <template v-for="(row, rowIndex) in values || []" :key="rowIndex">
        <b class="heat-y">{{ yLabels?.[rowIndex] || rowIndex + 1 }}</b>
        <span
          v-for="(value, columnIndex) in row"
          :key="`${rowIndex}-${columnIndex}`"
          class="heat-cell"
          :style="{ background: `rgba(34, 211, 238, ${alpha(value)})` }"
          :title="`${yLabels?.[rowIndex] || ''} / ${xLabels?.[columnIndex] || ''}: ${value}`"
        >{{ value }}</span>
      </template>
    </div>
  </section>
</template>
