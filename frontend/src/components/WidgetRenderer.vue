<script setup lang="ts">
import type { Widget } from '../workspace/types'
import TrendChart from './TrendChart.vue'
defineProps<{ widget: Widget }>()
</script>

<template>
  <section class="surface widget" :class="`widget-${widget.type}`">
    <div class="surface-heading"><div><span class="eyebrow">INTELLIGENCE</span><h2>{{ widget.title }}</h2></div><button class="icon-button" aria-label="更多">•••</button></div>
    <TrendChart v-if="widget.type === 'trend'" :points="widget.points ?? []" />
    <ul v-else-if="widget.type === 'insights'" class="insights">
      <li v-for="(item, index) in widget.items" :key="item"><span>{{ String(index + 1).padStart(2, '0') }}</span><p>{{ item }}</p><b>↗</b></li>
    </ul>
    <div v-else class="unknown-widget">等待组件渲染器：{{ widget.type }}</div>
  </section>
</template>

