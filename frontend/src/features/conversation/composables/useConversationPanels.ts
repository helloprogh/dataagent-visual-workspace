import { computed, ref } from 'vue'
import type { ConversationFilePreview } from '../types/filePreview'

export type InspectorPanel = 'none' | 'preview' | 'deliverables' | 'audit'

export function useConversationPanels() {
  const panel = ref<InspectorPanel>('none')
  const activePreview = ref<ConversationFilePreview | null>(null)
  const previewApprovalSubmitted = ref(false)

  const deliverablesOpen = computed(() => panel.value === 'deliverables')
  const auditOpen = computed(() => panel.value === 'audit')
  const previewOpen = computed(() => panel.value === 'preview' && Boolean(activePreview.value))
  const anyInspectorOpen = computed(() => previewOpen.value || deliverablesOpen.value || auditOpen.value)

  function openPreview(file: ConversationFilePreview) {
    activePreview.value = file
    previewApprovalSubmitted.value = false
    panel.value = 'preview'
  }

  function openDeliverable(file: ConversationFilePreview) {
    activePreview.value = file
    previewApprovalSubmitted.value = false
    panel.value = 'preview'
  }

  function toggleDeliverables() {
    activePreview.value = null
    previewApprovalSubmitted.value = false
    panel.value = panel.value === 'deliverables' ? 'none' : 'deliverables'
  }

  function toggleAudit() {
    activePreview.value = null
    previewApprovalSubmitted.value = false
    panel.value = panel.value === 'audit' ? 'none' : 'audit'
  }

  function closePreview() {
    activePreview.value = null
    previewApprovalSubmitted.value = false
    if (panel.value === 'preview') panel.value = 'none'
  }

  function closeInspector() {
    activePreview.value = null
    previewApprovalSubmitted.value = false
    panel.value = 'none'
  }

  return {
    panel,
    activePreview,
    previewApprovalSubmitted,
    previewOpen,
    deliverablesOpen,
    auditOpen,
    anyInspectorOpen,
    openPreview,
    openDeliverable,
    toggleDeliverables,
    toggleAudit,
    closePreview,
    closeInspector,
  }
}
