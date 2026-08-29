<script setup lang="ts">
import { watch } from 'vue'
import { useInterrupt } from '@copilotkit/vue/v2'
import AguiInterruptCard from './AguiInterruptCard.vue'

const emit = defineEmits<{ 'active-change': [active: boolean] }>()

// AguiInterruptHost provides an explicit CopilotKit chat configuration with
// the same agentId + threadId as CopilotChat. Keep the standard interrupt
// lifecycle owned by CopilotKit: it accumulates per-interrupt decisions and
// emits one complete AG-UI resume[] run after the final item is addressed.
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
