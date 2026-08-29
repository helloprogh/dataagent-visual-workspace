<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import {
  buildResumeArray,
  isInterruptExpired,
  useAgent,
  useCopilotKit,
  type AbstractAgent,
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

// Bind directly to the same thread-scoped agent clone as CopilotChat. Keep the
// subscription stable when useAgent refreshes the same shallow-ref instance;
// otherwise a reactive refresh can tear down the listener and clear a still
// visible interrupt before the user submits a response.
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

let subscribedAgent: AbstractAgent | null = null
let agentSubscription: { unsubscribe: () => void } | null = null
let completedInterrupts: Interrupt[] | null = null

function clearResponses() {
  for (const id of Object.keys(responses)) delete responses[id]
}

function interruptSetKey(items: readonly Interrupt[]) {
  return items.map(interrupt => interrupt.id).join('\u0000')
}

function setInterrupts(next: readonly Interrupt[], forceReset = false) {
  const changed = interruptSetKey(interrupts.value) !== interruptSetKey(next)
  interrupts.value = [...next]
  if (changed || forceReset) clearResponses()
  emit('active-change', interrupts.value.length > 0)
}

function authoritativeInterrupts(): Interrupt[] {
  const pending = agent.value?.pendingInterrupts
  return pending?.length ? [...pending] : [...interrupts.value]
}

function releaseAgentSubscription() {
  agentSubscription?.unsubscribe()
  agentSubscription = null
  subscribedAgent = null
  completedInterrupts = null
}

watch(agent, resolvedAgent => {
  // useAgent can trigger the shallow ref again for the same thread clone. Do
  // not treat that as an agent switch: preserving the subscription and staged
  // responses is essential while a HITL card is open.
  if (resolvedAgent && resolvedAgent === subscribedAgent) {
    if (resolvedAgent.pendingInterrupts?.length) {
      setInterrupts(resolvedAgent.pendingInterrupts)
    }
    return
  }

  releaseAgentSubscription()
  setInterrupts([], true)
  if (!resolvedAgent) return

  subscribedAgent = resolvedAgent
  if (resolvedAgent.pendingInterrupts?.length) {
    setInterrupts(resolvedAgent.pendingInterrupts, true)
  }

  agentSubscription = resolvedAgent.subscribe({
    onRunStartedEvent: () => {
      completedInterrupts = null
      setInterrupts([], true)
    },
    onRunFinishedEvent: params => {
      completedInterrupts = params.outcome === 'interrupt'
        ? [...params.interrupts]
        : []
    },
    onRunFinalized: () => {
      if (completedInterrupts !== null) setInterrupts(completedInterrupts, true)
      completedInterrupts = null
    },
    onRunFailed: () => {
      completedInterrupts = null
      setInterrupts([], true)
    },
  })
}, { immediate: true })

async function submitIfComplete() {
  const open = authoritativeInterrupts()
  if (!open.length || !open.every(interrupt => responses[interrupt.id])) return

  // Synchronize the rendered copy from the protocol-owned pending set without
  // clearing the responses that have just been collected from the form.
  setInterrupts(open)

  const expired = open.find(interrupt => isInterruptExpired(interrupt))
  if (expired) throw new Error(`该请求已过期（${expired.expiresAt ?? '未知时间'}），请重新发起。`)

  const currentAgent = agent.value
  if (!currentAgent) throw new Error('当前会话运行时不可用，请重试。')

  const resume = buildResumeArray(open, responses)
  // RUN_STARTED is the authoritative transition that closes the card. If the
  // resumed run rejects before starting, keep the staged responses so the user
  // can submit again instead of silently losing the decision.
  return copilotkit.value.runAgent({ agent: currentAgent, resume })
}

const resolve: InterruptResolveFn = async (payload?, interruptId?) => {
  const open = authoritativeInterrupts()
  const id = interruptId ?? open[0]?.id
  if (!id || !open.some(interrupt => interrupt.id === id)) return
  responses[id] = { status: 'resolved', payload }
  return submitIfComplete()
}

const cancel: InterruptCancelFn = async (interruptId?) => {
  const open = authoritativeInterrupts()
  const id = interruptId ?? open[0]?.id
  if (!id || !open.some(interrupt => interrupt.id === id)) return
  responses[id] = { status: 'cancelled' }
  return submitIfComplete()
}

onBeforeUnmount(() => {
  releaseAgentSubscription()
  setInterrupts([], true)
})
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
