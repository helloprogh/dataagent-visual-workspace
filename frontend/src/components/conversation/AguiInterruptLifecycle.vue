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

function ids(items: readonly Interrupt[]) {
  return items.map(interrupt => interrupt.id)
}

function clearResponses() {
  for (const id of Object.keys(responses)) delete responses[id]
}

function interruptSetKey(items: readonly Interrupt[]) {
  return items.map(interrupt => interrupt.id).join('\u0000')
}

function setInterrupts(next: readonly Interrupt[], forceReset = false) {
  const changed = interruptSetKey(interrupts.value) !== interruptSetKey(next)
  console.debug('[HITL-LIFECYCLE] set', { threadId: props.threadId, next: ids(next), previous: ids(interrupts.value), changed, forceReset })
  interrupts.value = [...next]
  if (changed || forceReset) clearResponses()
  emit('active-change', interrupts.value.length > 0)
}

function authoritativeInterrupts(): Interrupt[] {
  const pending = agent.value?.pendingInterrupts
  const open = pending?.length ? [...pending] : [...interrupts.value]
  console.debug('[HITL-LIFECYCLE] authoritative', { threadId: props.threadId, pending: ids(pending ?? []), rendered: ids(interrupts.value), open: ids(open) })
  return open
}

function releaseAgentSubscription() {
  agentSubscription?.unsubscribe()
  agentSubscription = null
  subscribedAgent = null
  completedInterrupts = null
}

watch(agent, resolvedAgent => {
  console.debug('[HITL-LIFECYCLE] agent-watch', { threadId: props.threadId, agentThreadId: resolvedAgent?.threadId, same: Boolean(resolvedAgent && resolvedAgent === subscribedAgent), pending: ids(resolvedAgent?.pendingInterrupts ?? []) })
  if (resolvedAgent && resolvedAgent === subscribedAgent) {
    if (resolvedAgent.pendingInterrupts?.length) setInterrupts(resolvedAgent.pendingInterrupts)
    return
  }

  releaseAgentSubscription()
  setInterrupts([], true)
  if (!resolvedAgent) return

  subscribedAgent = resolvedAgent
  if (resolvedAgent.pendingInterrupts?.length) setInterrupts(resolvedAgent.pendingInterrupts, true)

  agentSubscription = resolvedAgent.subscribe({
    onRunStartedEvent: () => {
      console.debug('[HITL-LIFECYCLE] run-started', { threadId: props.threadId })
      completedInterrupts = null
      setInterrupts([], true)
    },
    onRunFinishedEvent: params => {
      completedInterrupts = params.outcome === 'interrupt' ? [...params.interrupts] : []
      console.debug('[HITL-LIFECYCLE] run-finished', { threadId: props.threadId, outcome: params.outcome, interrupts: ids(completedInterrupts) })
    },
    onRunFinalized: () => {
      console.debug('[HITL-LIFECYCLE] run-finalized', { threadId: props.threadId, interrupts: ids(completedInterrupts ?? []) })
      if (completedInterrupts !== null) setInterrupts(completedInterrupts, true)
      completedInterrupts = null
    },
    onRunFailed: () => {
      console.debug('[HITL-LIFECYCLE] run-failed', { threadId: props.threadId })
      completedInterrupts = null
      setInterrupts([], true)
    },
  })
}, { immediate: true })

async function submitIfComplete() {
  const open = authoritativeInterrupts()
  console.debug('[HITL-LIFECYCLE] submit', { threadId: props.threadId, open: ids(open), responses: Object.keys(responses) })
  if (!open.length || !open.every(interrupt => responses[interrupt.id])) return

  setInterrupts(open)
  const expired = open.find(interrupt => isInterruptExpired(interrupt))
  if (expired) throw new Error(`该请求已过期（${expired.expiresAt ?? '未知时间'}），请重新发起。`)

  const currentAgent = agent.value
  if (!currentAgent) throw new Error('当前会话运行时不可用，请重试。')

  const resume = buildResumeArray(open, responses)
  console.debug('[HITL-LIFECYCLE] dispatch-resume', { threadId: props.threadId, agentThreadId: currentAgent.threadId, interruptIds: resume.map(entry => entry.interruptId) })
  return copilotkit.value.runAgent({ agent: currentAgent, resume })
}

const resolve: InterruptResolveFn = async (payload?, interruptId?) => {
  const open = authoritativeInterrupts()
  const id = interruptId ?? open[0]?.id
  console.debug('[HITL-LIFECYCLE] resolve', { threadId: props.threadId, requestedId: interruptId, resolvedId: id, open: ids(open) })
  if (!id || !open.some(interrupt => interrupt.id === id)) return
  responses[id] = { status: 'resolved', payload }
  return submitIfComplete()
}

const cancel: InterruptCancelFn = async (interruptId?) => {
  const open = authoritativeInterrupts()
  const id = interruptId ?? open[0]?.id
  console.debug('[HITL-LIFECYCLE] cancel', { threadId: props.threadId, requestedId: interruptId, resolvedId: id, open: ids(open) })
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
