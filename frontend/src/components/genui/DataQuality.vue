<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{
  title?: string
  score?: number
  status?: 'excellent' | 'good' | 'warning' | 'critical'
  dimensions?: Array<{ label: string; score: number; note?: string }>
}>()
const safeScore = computed(() => Math.min(100, Math.max(0, props.score ?? 0)))
const ring = computed(() => `conic-gradient(var(--accent-cyan) ${safeScore.value}%, rgba(100,116,139,.16) 0)`)
</script>

<template>
  <section class="gen-card quality-card">
    <div class="gen-title-row">
      <div>
        <span class="eyebrow">DATA TRUST</span>
        <span class="gen-title">{{ title || '数据质量评分' }}</span>
      </div>
      <span class="quality-status" :class="status || 'good'">{{ status || 'good' }}</span>
    </div>
    <div class="quality-layout">
      <div class="quality-ring" :style="{ background: ring }">
        <div class="quality-ring-inner"><b>{{ safeScore }}</b><span>/ 100</span></div>
      </div>
      <div class="quality-dimensions">
        <div v-for="item in dimensions || []" :key="item.label" class="quality-row">
          <div class="quality-label"><span>{{ item.label }}</span><b>{{ item.score }}</b></div>
          <div class="quality-bar"><i :style="{ width: `${Math.min(100, Math.max(0, item.score))}%` }"></i></div>
          <small v-if="item.note">{{ item.note }}</small>
        </div>
      </div>
    </div>
  </section>
</template>
