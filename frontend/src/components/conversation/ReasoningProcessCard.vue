<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  content: string
  running?: boolean
}>(), {
  running: false,
})

const expanded = ref(false)
watch(() => props.running, running => {
  if (running) expanded.value = true
}, { immediate: true })

const title = computed(() => props.running ? '正在思考' : '思考过程')
</script>

<template>
  <section class="reasoning-card" data-testid="agent-reasoning-card">
    <button class="reasoning-card__header" type="button" :aria-expanded="expanded" @click="expanded = !expanded">
      <span class="reasoning-card__indicator" :class="{ running }" aria-hidden="true"></span>
      <span>{{ title }}</span>
      <span class="reasoning-card__toggle">{{ expanded ? '收起' : '展开' }}</span>
    </button>
    <div v-if="expanded" class="reasoning-card__content">{{ content }}</div>
  </section>
</template>

<style scoped>
.reasoning-card{width:min(100%,720px);margin:2px 0 8px;border-left:2px solid var(--da-border);color:var(--da-text-muted)}
.reasoning-card__header{width:100%;display:flex;align-items:center;gap:8px;padding:5px 10px;border:0;background:transparent;color:var(--da-text-muted);font:inherit;font-size:12px;text-align:left;cursor:pointer}
.reasoning-card__header:focus-visible{outline:2px solid var(--da-border-focus);outline-offset:-2px}
.reasoning-card__indicator{width:6px;height:6px;border-radius:50%;background:var(--da-text-subtle)}
.reasoning-card__indicator.running{background:var(--da-accent-cyan);animation:pulse 1.2s ease-in-out infinite}
.reasoning-card__toggle{margin-left:auto;color:var(--da-text-subtle);font-size:11px}
.reasoning-card__content{padding:5px 12px 10px;white-space:pre-wrap;color:var(--da-text-secondary);font-size:12px;line-height:1.65}
@keyframes pulse{50%{opacity:.35}}
</style>
