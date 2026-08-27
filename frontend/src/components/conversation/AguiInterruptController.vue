<script setup lang="ts">
import { watch } from 'vue'
import { useInterrupt } from '@copilotkit/vue/v2'

const emit = defineEmits<{ 'active-change': [active: boolean] }>()
const { hasInterrupt } = useInterrupt()

watch(hasInterrupt, active => emit('active-change', active), { immediate: true })
</script>

<template>
  <span class="agui-interrupt-controller" aria-hidden="true"></span>
</template>

<style scoped>
.agui-interrupt-controller{display:none}
</style>
