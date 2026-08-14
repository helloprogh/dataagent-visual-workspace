<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ title?: string; items?: Array<{ label: string; value: number }> }>()
const max = computed(() => Math.max(1, ...(props.items || []).map(i => i.value)))
</script>
<template>
  <div class="gen-card"><div class="gen-title">{{ title || '柱状图' }}</div>
    <div class="bars"><div class="bar-row" v-for="i in (items || [])" :key="i.label"><span class="bar-label">{{ i.label }}</span><div class="bar-track"><div class="bar-fill" :style="{ width: `${Math.max(2, i.value / max * 100)}%` }"></div></div><b>{{ i.value }}</b></div></div>
  </div>
</template>
