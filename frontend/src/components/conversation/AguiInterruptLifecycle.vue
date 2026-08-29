<script setup lang="ts">
import { shallowRef, watch } from 'vue'
import {
  buildResumeArray,
  isInterruptExpired,
  useAgent,
  useCopilotKit,
  type Interrupt,
  type InterruptCancelFn,
  type InterruptResolveFn,
} from '@copilotkit/vue/v2'
import AguiInterruptCard from './AguiInterruptCard.vue'

const props = defineProps<{
  agentId: string
  threadId: string
}>()

const emit = defineEmits<{ 'active-change': [active: boolean] }>()

// Bind the lifecycle directly to the same thread-scoped agent clone that
// CopilotChat uses. The stock Vue useInterrupt composable keeps its pending
// standard-interrupt state inside the composable instance; when used from our
// custom message-view subtree that state can become detached from the card that
// remains rendered. Tracking RUN_FINISHED on the thread clone itself avoids that
// split while still using the standard AG-UI ResumeEntry[] contract and
// CopilotKit's runAgent pipeline.
const { copilotkit } = useCopilotKit()
const { agent } = useAgent({
  agentId: () => props.agentId,
  threadId: () => props.threadId,
  updates: [],
})

const interrupts = shallowRef<Interrupt[]>([])
type ResumeResponse =
  | { status: 'resolved'; payload?: unknown }
  | { status: 'cancelled' }
const responses: Record<string, ResumeResponse> = {}

function clearResponses() {
  for (const id of Object.keys(responses)) delete responses[id]
}

function setInterrupts(next: readonly Interrupt[]) {
  interrupts.value = [...next]
  clearResponses()
  emit('active-change', interrupts.value.length > 0)
}

watch(agent, (resolvedAgent, _previous, onCleanup) => {
  setInterrupts([])
  if (!resolvedAgent) return

  // If this host is recreated after the run has already finalized, restore
  // directly from the agent's protocol state instead of losing the interrupt.
  if (resolvedAgent.pendingInterrupts?.length) {
    setInterrupts(resolvedAgent.pendingInterrupts)
  }

  let completedInterrupts: Interrupt[] | null = null
  const subscription = resolvedAgent.subscribe({
    onRunStartedEvent: () => {
      completedInterrupts = null
      setInterrupts([])
    },
    onRunFinishedEvent: params => {
      completedInterrupts = params.outcome === 'interrupt'
        ? [...params.interrupts]
        : []
    },
    onRunFinalized: () => {
      if (completedInterrupts !== null) setInterrupts(completedInterrupts)
      completedInterrupts = null
    },
    onRunFailed: () => {
      completedInterrupts = null
      setInterrupts([])
    },
  })

  onCleanup(() => {
    subscription.unsubscribe()
    completedInterrupts = null
    setInterrupts([])
  })
}, { immediate: true })

async function submitIfComplete() {
  const open = interrupts.value
  if (!open.length || !open.every(interrupt => responses[interrupt.id])) return

  const expired = open.find(interrupt => isInterruptExpired(interrupt))
  if (expired) throw new Error(`该请求已过期（${expired.expiresAt ?? '未知时间'}），请重新发起。`)

  const currentAgent = agent.value
  if (!currentAgent) throw new Error('当前会话运行时不可用，请重试。')

  const resume = buildResumeArray(open, responses)
  // Do not clear pending state here. The resumed run's RUN_STARTED event is the
  // authoritative transition that closes the card. If runAgent rejects before
  // starting, keeping the responses allows the user to retry the same submit.
  return copilotkit.value.runAgent({ agent: currentAgent, resume })
}

const resolve: InterruptResolveFn = async (payload?, interruptId?) => {
  const open = interrupts.value
  const id = interruptId ?? open[0]?.id
  if (!id || !open.some(interrupt => interrupt.id === id)) return
  responses[id] = { status: 'resolved', payload }
  return submitIfComplete()
}

const cancel: InterruptCancelFn = async (interruptId?) => {
  const open = interrupts.value
  const id = interruptId ?? open[0]?.id
  if (!id || !open.some(interrupt => interrupt.id === id)) return
  responses[id] = { status: 'cancelled' }
  return submitIfComplete()
}
</script>

<template>
  <AguiInterruptCard
    v-if="interrupts.length"
    :interrupt="interrupts[0]"
    :interrupts="interrupts"
    :resolve="resolve"
    :cancel="cancel"
  />
</template>
