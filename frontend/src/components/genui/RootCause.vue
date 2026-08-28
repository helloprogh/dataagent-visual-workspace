<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{
  title?: string
  target?: string
  factors?: Array<{ label: string; contribution: number; description?: string }>
}>()
const maxAbs = computed(() => Math.max(1, ...(props.factors || []).map(f => Math.abs(f.contribution))))
</script>

<template>
  <section class="gen-card root-cause-card">
    <div class="gen-title-row">
      <div>
        <span class="eyebrow">主要归因</span>
        <span class="gen-title">{{ title || '归因分析' }}</span>
      </div>
      <span v-if="target" class="target-chip">目标：{{ target }}</span>
    </div>
    <div class="root-cause-list">
      <div v-for="(factor, index) in factors || []" :key="factor.label" class="cause-row">
        <span class="cause-rank">{{ index + 1 }}</span>
        <div class="cause-main">
          <div class="cause-title">
            <b>{{ factor.label }}</b>
            <strong :class="factor.contribution >= 0 ? 'up' : 'down'">
              {{ factor.contribution >= 0 ? '+' : '' }}{{ factor.contribution }}%
            </strong>
          </div>
          <div class="cause-track">
            <div
              class="cause-fill"
              :class="factor.contribution >= 0 ? 'positive' : 'negative'"
              :style="{ width: `${Math.max(6, Math.abs(factor.contribution) / maxAbs * 100)}%` }"
            ></div>
          </div>
          <p v-if="factor.description">{{ factor.description }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
