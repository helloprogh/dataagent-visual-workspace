<script setup lang="ts">
import { watch } from 'vue'
import { useAgent, useCopilotKit, useInterrupt } from '@copilotkit/vue/v2'
import { buildResumeArray, isInterruptExpired, type Interrupt } from '@ag-ui/client'
import AguiInterruptCard from './AguiInterruptCard.vue'

const emit = defineEmits<{ 'active-change': [active: boolean] }>()

// The host provides the same explicit agentId + threadId as CopilotChat, so
// useAgent() and useInterrupt() resolve the same per-thread clone. CopilotKit
// Vue 1.64.1 detects standard interrupts correctly, but its resolve/cancel
// path can return without dispatching runAgent(resume) in this real-thread
// integration. Keep useInterrupt as the standard interrupt detector and use
// only public CopilotKit/AG-UI APIs for the final atomic resume[] dispatch.
const { copilotkit } = useCopilotKit()
const { agent } = useAgent({ updates: [] })
const { hasInterrupt, slotProps } = useInterrupt({ renderInChat: false })

type ResumeResponse =
  | { status: 'resolved'; payload?: unknown }
  | { status: 'cancelled' }

const responses: Record<string, ResumeResponse> = {}
let currentInterruptKey = ''

function clearResponses() {
  for (const id of Object.keys(responses)) delete responses[id]
}

function openInterrupts(): Interrupt[] {
  const pending = agent.value?.pendingInterrupts
  if (pending?.length) return [...pending]
  const rendered = slotProps.value?.interrupts
  if (rendered?.length) return [...rendered]
  const primary = slotProps.value?.interrupt
  return primary ? [primary] : []
}

function interruptKey(interrupts: readonly Interrupt[]) {
  return interrupts.map(item => item.id).join('\u0000')
}

watch(
  () => openInterrupts(),
  interrupts => {
    const nextKey = interruptKey(interrupts)
    if (nextKey !== currentInterruptKey) {
      clearResponses()
      currentInterruptKey = nextKey
    }
  },
  { immediate: true },
)

watch(hasInterrupt, active => {
  emit('active-change', active)
  if (!active) {
    clearResponses()
    currentInterruptKey = ''
  }
}, { immediate: true })

async function submitIfComplete() {
  const interrupts = openInterrupts()
  if (!interrupts.length || !interrupts.every(item => responses[item.id])) return

  const expired = interrupts.find(item => isInterruptExpired(item))
  if (expired) {
    clearResponses()
    throw new Error(`该请求已过期（${expired.expiresAt ?? '未知时间'}），请重新发起。`)
  }

  const currentAgent = agent.value
  if (!currentAgent) throw new Error('当前会话运行时不可用，请重试。')

  const resume = buildResumeArray(interrupts, responses)
  clearResponses()
  return copilotkit.value.runAgent({ agent: currentAgent, resume })
}

async function resolve(payload?: unknown, interruptId?: string) {
  const interrupts = openInterrupts()
  const id = interruptId ?? interrupts[0]?.id
  if (!id || !interrupts.some(item => item.id === id)) {
    throw new Error('当前请求已变化，请重新选择后提交。')
  }
  responses[id] = { status: 'resolved', payload }
  return submitIfComplete()
}

async function cancel(interruptId?: string) {
  const interrupts = openInterrupts()
  const id = interruptId ?? interrupts[0]?.id
  if (!id || !interrupts.some(item => item.id === id)) {
    throw new Error('当前请求已变化，请重新选择后提交。')
  }
  responses[id] = { status: 'cancelled' }
  return submitIfComplete()
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
