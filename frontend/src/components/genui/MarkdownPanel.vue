<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ title?: string; content: string }>()

const lines = computed(() => props.content.split(/\r?\n/).map((raw, index) => {
  const value = raw.trim()
  if (!value) return { id: index, kind: 'space', text: '' }
  if (value.startsWith('### ')) return { id: index, kind: 'h3', text: value.slice(4) }
  if (value.startsWith('## ')) return { id: index, kind: 'h2', text: value.slice(3) }
  if (value.startsWith('# ')) return { id: index, kind: 'h1', text: value.slice(2) }
  if (/^[-*] /.test(value)) return { id: index, kind: 'item', text: value.slice(2) }
  return { id: index, kind: 'paragraph', text: raw }
}))
</script>

<template>
  <section class="gen-card markdown-panel">
    <div class="gen-title-row" v-if="title">
      <div>
        <span class="eyebrow">GENERATED NOTE</span>
        <div class="gen-title">{{ title }}</div>
      </div>
    </div>
    <div class="markdown-content">
      <template v-for="line in lines" :key="line.id">
        <div v-if="line.kind === 'space'" class="markdown-space"></div>
        <h2 v-else-if="line.kind === 'h1'">{{ line.text }}</h2>
        <h3 v-else-if="line.kind === 'h2'">{{ line.text }}</h3>
        <h4 v-else-if="line.kind === 'h3'">{{ line.text }}</h4>
        <div v-else-if="line.kind === 'item'" class="markdown-item"><i></i><span>{{ line.text }}</span></div>
        <p v-else>{{ line.text }}</p>
      </template>
    </div>
  </section>
</template>

<style scoped>
.markdown-panel{height:100%;padding:22px 24px}
.markdown-content{display:flex;flex-direction:column;gap:8px;color:#d8e7f5;line-height:1.7}
.markdown-content h2,.markdown-content h3,.markdown-content h4{margin:0;color:#f4f9ff;letter-spacing:-.01em}
.markdown-content h2{font-size:24px}.markdown-content h3{font-size:19px}.markdown-content h4{font-size:16px}
.markdown-content p{margin:0;white-space:pre-wrap;font-size:14px}
.markdown-space{height:4px}
.markdown-item{display:flex;gap:10px;align-items:flex-start;font-size:14px}
.markdown-item i{width:6px;height:6px;margin-top:9px;border-radius:50%;background:#4ee6c3;box-shadow:0 0 10px rgba(78,230,195,.55);flex:0 0 auto}
</style>
