<script setup lang="ts">
import AguiInterruptLifecycle from './AguiInterruptLifecycle.vue'

defineProps<{
  agentId: string
  threadId: string
}>()

const emit = defineEmits<{ 'active-change': [active: boolean] }>()
</script>

<template>
  <AguiInterruptLifecycle
    :agent-id="agentId"
    :thread-id="threadId"
    @active-change="emit('active-change', $event)"
  />
</template>
