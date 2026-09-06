<script setup lang="ts">
import { computed } from 'vue'
import { A2UI_CATALOG_ID } from '../../../../../shared/a2ui-catalog.mjs'
import type { ConversationFilePreview } from '../types/filePreview'
import A2uiSurfaceCard from './A2uiSurfaceCard.vue'

const props = defineProps<{ file: ConversationFilePreview; pending?: boolean; busy?: boolean }>()
const emit = defineEmits<{ preview: [file: ConversationFilePreview]; confirm: [id: string]; cancel: [id: string] }>()
// This is a protocol projection, not a direct renderer. Artifact metadata stays
// in the existing conversation domain; component nodes contain only its ID.
const content = computed(() => ({ operations: [
  { createSurface: { surfaceId: 'artifact', catalogId: A2UI_CATALOG_ID } },
  { updateComponents: { surfaceId: 'artifact', components: [
    { id: 'root', component: 'ArtifactCard', artifactId: props.file.id },
  ] } },
] }))
const pendingIds = computed(() => props.pending && props.file.approvalInterruptId ? [props.file.approvalInterruptId] : [])
</script>

<template>
  <A2uiSurfaceCard
    compact
    :content="content"
    :message-id="file.id"
    :artifacts="[file]"
    :pending-interrupt-ids="pendingIds"
    :busy="busy"
    :approval-busy="busy"
    @preview="emit('preview', $event)"
    @confirm="emit('confirm', $event)"
    @cancel="emit('cancel', $event)"
  />
</template>
