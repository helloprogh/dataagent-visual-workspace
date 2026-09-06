<script setup lang="ts">
import type { Interrupt, ResumeEntry } from '@ag-ui/client'
import type { ConversationFilePreview } from '../types/filePreview'
import FilePreviewPanel from './FilePreviewPanel.vue'
import DeliverablesPanel from './DeliverablesPanel.vue'
import AuditPanel, { type AuditEntry } from './AuditPanel.vue'

defineProps<{
  activePreview: ConversationFilePreview | null
  previewInterrupts: Interrupt[]
  running: boolean
  previewApprovalSubmitted: boolean
  deliverablesOpen: boolean
  deliverables: ConversationFilePreview[]
  pendingApprovalCount: number
  auditOpen: boolean
  auditEntries: AuditEntry[]
}>()
const emit = defineEmits<{
  closePreview: []
  closePanels: []
  resume: [entries: ResumeEntry[]]
  select: [file: ConversationFilePreview]
}>()
</script>

<template>
  <FilePreviewPanel
    v-if="activePreview"
    :file="activePreview"
    :interrupts="previewInterrupts"
    :busy="running"
    :approval-submitted="previewApprovalSubmitted"
    @close="emit('closePreview')"
    @resume="emit('resume', $event)"
  />
  <DeliverablesPanel
    v-else-if="deliverablesOpen"
    :files="deliverables"
    :pending-approvals="pendingApprovalCount"
    @close="emit('closePanels')"
    @select="emit('select', $event)"
  />
  <AuditPanel
    v-else-if="auditOpen"
    :entries="auditEntries"
    @close="emit('closePanels')"
  />
</template>
