<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{
  title?: string
  metric?: string
  value?: string | number
  change?: number
  horizon?: string
  confidence?: number
  points?: Array<{ label: string; actual?: number; forecast?: number }>
}>()
const width = 560
const height = 150
const pad = 16
const allValues = computed(() => (props.points || []).flatMap(p => [p.actual, p.forecast]).filter((v): v is number => typeof v === 'number'))
const min = computed(() => Math.min(...allValues.value, 0))
const max = computed(() => Math.max(...allValues.value, 1))
const range = computed(() => Math.max(1, max.value - min.value))
function toPoints(key: 'actual' | 'forecast') {
  const data = props.points || []
  return data.map((p, i) => {
    const value = p[key]
    if (value === undefined) return null
    const x = data.length <= 1 ? width / 2 : pad + i * ((width - pad * 2) / (data.length - 1))
    const y = height - pad - ((value - min.value) / range.value) * (height - pad * 2)
    return `${x},${y}`
  }).filter(Boolean).join(' ')
}
const actualPoints = computed(() => toPoints('actual'))
const forecastPoints = computed(() => toPoints('forecast'))
</script>

<template>
  <section class="gen-card forecast-card">
    <div class="gen-title-row">
      <div>
        <span class="eyebrow">FORECAST</span>
        <span class="gen-title">{{ title || '趋势预测' }}</span>
      </div>
      <span v-if="horizon" class="forecast-horizon">{{ horizon }}</span>
    </div>
    <div class="forecast-summary">
      <div><span>{{ metric || '预测值' }}</span><strong>{{ value ?? '--' }}</strong></div>
      <span v-if="change !== undefined" :class="change >= 0 ? 'up' : 'down'">{{ change >= 0 ? '↗' : '↘' }} {{ Math.abs(change) }}%</span>
      <span v-if="confidence !== undefined" class="confidence-chip">置信度 {{ confidence }}%</span>
    </div>
    <svg class="forecast-svg" :viewBox="`0 0 ${width} ${height}`">
      <defs>
        <linearGradient id="forecastGlow" x1="0" x2="1">
          <stop offset="0%" stop-color="#60a5fa" />
          <stop offset="100%" stop-color="#22d3ee" />
        </linearGradient>
      </defs>
      <line v-for="i in 3" :key="i" x1="0" :x2="width" :y1="i * 38" :y2="i * 38" class="chart-grid" />
      <polyline v-if="actualPoints" :points="actualPoints" class="forecast-actual" fill="none" />
      <polyline v-if="forecastPoints" :points="forecastPoints" class="forecast-predicted" fill="none" />
    </svg>
    <div class="forecast-legend"><span><i class="actual"></i>实际</span><span><i class="predicted"></i>预测</span></div>
  </section>
</template>
