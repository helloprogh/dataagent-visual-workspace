<script setup lang="ts">
import type { Interrupt, ResumeEntry } from '@ag-ui/client'
import type { ConversationFilePreview } from '../types/filePreview'
import AuditPanel, { type AuditEntry } from './AuditPanel.vue'
import DeliverablesPanel from './DeliverablesPanel.vue'
import FilePreviewPanel from './FilePreviewPanel.vue'

const props = defineProps<{
  activePreview: ConversationFilePreview | null
  deliverablesOpen: boolean
  auditOpen: boolean
  deliverables: ConversationFilePreview[]
  pendingApprovals: number
  previewInterrupts: Interrupt[]
  running: boolean
  previewApprovalSubmitted: boolean
  auditEntries: AuditEntry[]
}>()

const emit = defineEmits<{
  close: []
  select: [file: ConversationFilePreview]
  resume: [entries: ResumeEntry[]]
}>()
</script>

<template>
  <FilePreviewPanel
    v-if="activePreview"
    :file="activePreview"
    :interrupts="previewInterrupts"
    :busy="running"
    :approval-submitted="previewApprovalSubmitted"
    @close="emit('close')"
    @resume="emit('resume', $event)"
  />
  <DeliverablesPanel
    v-else-if="deliverablesOpen"
    :files="deliverables"
    :pending-approvals="pendingApprovals"
    @close="emit('close')"
    @select="emit('select', $event)"
  />
  <AuditPanel
    v-else-if="auditOpen"
    :entries="auditEntries"
    @close="emit('close')"
  />
</template>
