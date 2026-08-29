<script setup lang="ts">
import { watch } from 'vue'
import { useInterrupt } from '@copilotkit/vue/v2'
import AguiInterruptCard from './AguiInterruptCard.vue'

const emit = defineEmits<{ 'active-change': [active: boolean] }>()

// This controller is rendered inside CopilotChat's input slot, which is already
// wrapped by CopilotChatConfigurationProvider with the active agentId + threadId.
// Keep the standard CopilotKit lifecycle authoritative and only render the full
// schema-driven response UI here. renderInChat:false prevents a duplicate card
// from being published through CopilotKit's global interrupt render state.
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
