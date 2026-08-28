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
        <span class="eyebrow">生成内容</span>
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
