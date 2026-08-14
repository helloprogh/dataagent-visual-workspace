<script setup lang="ts">
import { computed } from 'vue'
import { componentMap } from '../../genui/registry'
const props = defineProps<{ status: 'inProgress'|'executing'|'complete'; parameters: { component?: string; props?: Record<string, unknown> }; result?: string }>()
const target = computed(() => props.parameters.component ? componentMap[props.parameters.component] : undefined)
</script>
<template>
  <div v-if="status === 'inProgress'" class="gen-card skeleton">正在生成界面…</div>
  <div v-else-if="!target" class="gen-card error-card">未知生成式组件：{{ parameters.component }}</div>
  <component v-else :is="target" v-bind="parameters.props || {}" />
</template>
