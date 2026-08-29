<script setup lang="ts">
import { watch } from 'vue'
import { useInterrupt } from '@copilotkit/vue/v2'
import AguiInterruptCard from './AguiInterruptCard.vue'

const emit = defineEmits<{ 'active-change': [active: boolean] }>()

// This component must be rendered below a CopilotChatConfigurationProvider
// carrying the exact agentId + threadId used by CopilotChat. useInterrupt then
// resolves the same thread clone from CopilotKit's globalThreadCloneMap.
const {
  hasInterrupt,
  slotProps,
} = useInterrupt({ renderInChat: false })

watch(hasInterrupt, active => emit('active-change', active), { immediate: true })
</script>

<template>
  <AguiInterruptCard
    v-if="slotProps"
    :interrupt="slotProps.interrupt"
    :interrupts="slotProps.interrupts"
    :resolve="slotProps.resolve"
    :cancel="slotProps.cancel"
  />
</template>
