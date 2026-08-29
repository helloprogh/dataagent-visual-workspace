<script setup lang="ts">
import { CopilotChatConfigurationProvider } from '@copilotkit/vue/v2'
import AguiInterruptLifecycle from './AguiInterruptLifecycle.vue'

defineProps<{
  agentId: string
  threadId: string
}>()

const emit = defineEmits<{ 'active-change': [active: boolean] }>()
</script>

<template>
  <CopilotChatConfigurationProvider
    :agent-id="agentId"
    :thread-id="threadId"
    :has-explicit-thread-id="true"
  >
    <AguiInterruptLifecycle @active-change="emit('active-change', $event)" />
  </CopilotChatConfigurationProvider>
</template>
