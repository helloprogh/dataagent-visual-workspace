import { computed, onScopeDispose, ref } from 'vue'
import type { ResumeEntry } from '@ag-ui/client'
import type { ConversationFilePreview } from '../types/filePreview'

export function useConversationPanels() {
  const panel = ref<'none' | 'deliverables' | 'audit'>('none')
  const activePreview = ref<ConversationFilePreview | null>(null)
  const previewApprovalSubmitted = ref(false)
  const deliverablesOpen = computed(() => panel.value === 'deliverables')
  const auditOpen = computed(() => panel.value === 'audit')
  let generation = 0

  function closeFilePreview() {
    generation++
    activePreview.value = null
    previewApprovalSubmitted.value = false
  }
  function closePanels() {
    closeFilePreview()
    panel.value = 'none'
  }
  function openFilePreview(file: ConversationFilePreview) {
    closePanels()
    activePreview.value = file
  }
  function openDeliverable(file: ConversationFilePreview) {
    openFilePreview(file)
    // Closing this preview returns to its delivery list.
    panel.value = 'deliverables'
  }
  function toggleDeliverables() {
    const wasOpen = deliverablesOpen.value
    closePanels()
    if (!wasOpen) panel.value = 'deliverables'
  }
  function toggleAudit() {
    const wasOpen = auditOpen.value
    closePanels()
    if (!wasOpen) panel.value = 'audit'
  }
  async function resumePreviewApproval(entries: ResumeEntry[], submit: (entries: ResumeEntry[]) => Promise<boolean>) {
    const current = generation
    const file = activePreview.value
    if (!file) return
    const accepted = await submit(entries)
    if (accepted && current === generation && activePreview.value?.id === file.id
      && activePreview.value?.approvalInterruptId === file.approvalInterruptId) previewApprovalSubmitted.value = true
  }
  onScopeDispose(closePanels)
  return { activePreview, deliverablesOpen, auditOpen, previewApprovalSubmitted,
    openFilePreview, openDeliverable, toggleDeliverables, toggleAudit, closeFilePreview, closePanels, resumePreviewApproval }
}
