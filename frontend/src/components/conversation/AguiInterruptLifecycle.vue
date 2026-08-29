<script setup lang="ts">
import { watch } from 'vue'
import { useInterrupt } from '@copilotkit/vue/v2'
import AguiInterruptCard from './AguiInterruptCard.vue'

const emit = defineEmits<{ 'active-change': [active: boolean] }>()

// AguiInterruptHost provides the same explicit agentId + threadId as
// CopilotChat. Let CopilotKit own standard interrupt accumulation and the
// single complete AG-UI resume[] run; the card only stages UI values and
// converts Vue reactive values to plain JSON before calling resolve().
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
