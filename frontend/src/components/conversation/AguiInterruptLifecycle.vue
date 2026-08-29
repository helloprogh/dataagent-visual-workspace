<script setup lang="ts">
import { watch } from 'vue'
import { useInterrupt } from '@copilotkit/vue/v2'
import AguiInterruptCard from './AguiInterruptCard.vue'

const emit = defineEmits<{ 'active-change': [active: boolean] }>()

// The parent AguiInterruptHost supplies an explicit CopilotKit chat
// configuration with the same agentId + threadId as CopilotChat. This makes
// useInterrupt resolve the exact same per-thread agent clone and lets
// CopilotKit own response accumulation plus the single atomic resume[] run.
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
