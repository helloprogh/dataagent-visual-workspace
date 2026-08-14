<script setup lang="ts">
defineProps<{
  title?: string
  summary?: string
  confidence?: number
  tags?: string[]
  highlights?: Array<{ label: string; value: string; tone?: 'positive' | 'negative' | 'neutral' }>
}>()
</script>

<template>
  <section class="gen-card executive-card">
    <div class="executive-orbit" aria-hidden="true"></div>
    <div class="gen-title-row executive-head">
      <div>
        <span class="eyebrow">AI SYNTHESIS</span>
        <div class="gen-title">{{ title || '分析结论' }}</div>
      </div>
      <div v-if="confidence !== undefined" class="confidence-chip">
        <span class="pulse-dot"></span>
        置信度 {{ confidence }}%
      </div>
    </div>
    <p class="executive-summary">{{ summary || '暂无结论' }}</p>
    <div v-if="highlights?.length" class="highlight-strip">
      <div v-for="item in highlights" :key="item.label" class="highlight-item">
        <span>{{ item.label }}</span>
        <b :class="`tone-${item.tone || 'neutral'}`">{{ item.value }}</b>
      </div>
    </div>
    <div v-if="tags?.length" class="tag-cloud">
      <span v-for="tag in tags" :key="tag"># {{ tag }}</span>
    </div>
  </section>
</template>
