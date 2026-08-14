<script setup lang="ts">
defineProps<{
  title?: string
  model?: string
  description?: string
  dimensions?: string[]
  measures?: string[]
  metrics?: string[]
  sources?: string[]
}>()
</script>

<template>
  <section class="gen-card semantic-card">
    <div class="semantic-head">
      <div class="semantic-icon">◇</div>
      <div>
        <span class="eyebrow">SEMANTIC LAYER</span>
        <div class="gen-title">{{ title || model || '语义模型' }}</div>
        <p v-if="description">{{ description }}</p>
      </div>
    </div>
    <div class="semantic-columns">
      <div>
        <span class="semantic-label">DIMENSIONS</span>
        <div class="semantic-pills"><span v-for="item in dimensions || []" :key="item">{{ item }}</span></div>
      </div>
      <div>
        <span class="semantic-label">MEASURES</span>
        <div class="semantic-pills measures"><span v-for="item in measures || []" :key="item">{{ item }}</span></div>
      </div>
      <div>
        <span class="semantic-label">METRICS</span>
        <div class="semantic-pills metrics"><span v-for="item in metrics || []" :key="item">{{ item }}</span></div>
      </div>
    </div>
    <div v-if="sources?.length" class="semantic-sources"><span>来源</span><code v-for="source in sources" :key="source">{{ source }}</code></div>
  </section>
</template>
