import { computed, type Ref } from 'vue'
import type { Interrupt, Message } from '@ag-ui/client'
import { buildPresentation, messageText, type ProcessStep } from '../processPresentation'
import type { ConversationFilePreview } from '../types/filePreview'

type ViewState = {
  messages: Readonly<Ref<Message[]>>
  running: Readonly<Ref<boolean>>
  activeReasoningId: Readonly<Ref<string>>
  activeTextId: Readonly<Ref<string>>
  responsePhase: Readonly<Ref<'waiting' | 'thinking' | 'responding' | 'working'>>
  pendingInterrupts: Readonly<Ref<Interrupt[]>>
  deliverables: Readonly<Ref<ConversationFilePreview[]>>
  activePreview: Readonly<Ref<ConversationFilePreview | null>>
}

/** Read-only projections of the runtime and artifact snapshot, never another store. */
export function useConversationPresentation(state: ViewState) {
  const { messages, running, activeReasoningId, activeTextId, responsePhase, pendingInterrupts, deliverables, activePreview } = state
  const presentationItems = computed(() => buildPresentation(messages.value, running.value, activeReasoningId.value))
  const showResponsePending = computed(() => {
    if (!running.value) return false
    if (responsePhase.value === 'waiting') return true
    if (responsePhase.value === 'responding') return Boolean(activeTextId.value) && !messages.value.some(message => message.id === activeTextId.value && messageText(message))
    return false
  })
  const previewInterrupts = computed(() => {
    const interruptId = activePreview.value?.approvalInterruptId
    return interruptId ? pendingInterrupts.value.filter(interrupt => interrupt.id === interruptId) : []
  })
  const pendingInterruptIds = computed(() => pendingInterrupts.value.map(interrupt => interrupt.id))
  const deliveryApprovalIds = computed(() => new Set(deliverables.value
    .map(file => file.approvalInterruptId).filter((id): id is string => Boolean(id))))
  const pendingDelivery = computed(() => deliverables.value.find(file =>
    file.approvalInterruptId && pendingInterruptIds.value.includes(file.approvalInterruptId)))
  // Multiple decisions must stay together even if one is linked to a file.
  const composerInterrupts = computed(() => pendingInterrupts.value.length !== 1
    ? pendingInterrupts.value
    : pendingInterrupts.value.filter(interrupt => !deliveryApprovalIds.value.has(interrupt.id)))
  function generatedFilesForProcess(steps: ProcessStep[]) {
    const ids = new Set(steps.map(step => step.message.id))
    return deliverables.value.filter(file => file.sourceMessageId && ids.has(file.sourceMessageId))
  }
  return { presentationItems, showResponsePending, previewInterrupts, pendingInterruptIds, pendingDelivery, composerInterrupts, generatedFilesForProcess }
}
