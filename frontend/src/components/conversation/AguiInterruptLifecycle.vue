<script setup lang="ts">
import { watch } from 'vue'
import { useAgent, useInterrupt } from '@copilotkit/vue/v2'
import AguiInterruptCard from './AguiInterruptCard.vue'

const emit = defineEmits<{ 'active-change': [active: boolean] }>()

// The parent AguiInterruptHost supplies an explicit CopilotKit chat
// configuration with the same agentId + threadId as CopilotChat. This makes
// useInterrupt resolve the exact same per-thread agent clone and lets
// CopilotKit own response accumulation plus the single atomic resume[] run.
const { agent } = useAgent({ updates: [] })
const {
  hasInterrupt,
  slotProps,
  resolve: nativeResolve,
  cancel: nativeCancel,
} = useInterrupt({ renderInChat: false })

watch(hasInterrupt, active => emit('active-change', active), { immediate: true })

async function resolve(payload?: unknown, interruptId?: string) {
  console.debug('[HITL-RESOLVE] before', {
    interruptId,
    agentThreadId: agent.value?.threadId,
    agentPending: agent.value?.pendingInterrupts?.map(item => item.id) ?? [],
    slotInterrupts: slotProps.value?.interrupts?.map(item => item.id) ?? [],
    hasInterrupt: hasInterrupt.value,
  })
  const result = await nativeResolve(payload, interruptId)
  console.debug('[HITL-RESOLVE] after', {
    interruptId,
    agentThreadId: agent.value?.threadId,
    agentPending: agent.value?.pendingInterrupts?.map(item => item.id) ?? [],
    hasInterrupt: hasInterrupt.value,
  })
  return result
}

async function cancel(interruptId?: string) {
  console.debug('[HITL-CANCEL] before', {
    interruptId,
    agentThreadId: agent.value?.threadId,
    agentPending: agent.value?.pendingInterrupts?.map(item => item.id) ?? [],
    slotInterrupts: slotProps.value?.interrupts?.map(item => item.id) ?? [],
    hasInterrupt: hasInterrupt.value,
  })
  const result = await nativeCancel(interruptId)
  console.debug('[HITL-CANCEL] after', {
    interruptId,
    agentThreadId: agent.value?.threadId,
    agentPending: agent.value?.pendingInterrupts?.map(item => item.id) ?? [],
    hasInterrupt: hasInterrupt.value,
  })
  return result
}
</script>

<template>
  <AguiInterruptCard
    v-if="slotProps"
    :interrupt="slotProps.interrupt"
    :interrupts="slotProps.interrupts"
    :resolve="resolve"
    :cancel="cancel"
  />
</template>
