import { computed, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Interrupt, Message } from '@ag-ui/client'
import type { PendingAttachment } from './useAgentConversation'
import type { ConversationFilePreview } from '../types/filePreview'
import type { AuditEntry } from '../components/AuditPanel.vue'
import { messageText } from '../processPresentation'
import { normalizeUiContent } from '../../../../../shared/generative-ui.mjs'
import { artifactPathKey, generatedArtifactsFromTool, removedArtifactPathsFromTool } from '../../../../../shared/generated-artifacts.mjs'
import { dataAgentWebApi } from '../../../shared/config/api'

// Derive delivery and audit views from the same conversation snapshot.
export function useConversationArtifacts(
  messages: Ref<Message[]>,
  pendingInterrupts: Ref<Interrupt[]>,
  attachments: Ref<PendingAttachment[]>,
  activePreview: Ref<ConversationFilePreview | null>,
) {
  const { t } = useI18n()

  function previewFromPart(message: Message, part: any, index: number): ConversationFilePreview | null {
    if (!['image', 'audio', 'video', 'document', 'file'].includes(part?.type)) return null
    const url = String(part?.metadata?.clientPreviewUrl ?? part?.source?.value ?? '').trim()
    if (!url) return null
    return {
      id: String(part?.metadata?.fileId ?? `${message.id}-${index}`),
      name: String(part?.metadata?.filename ?? `${t('common.file')} ${index + 1}`),
      url,
      mimeType: String(part?.source?.mimeType ?? part?.mimeType ?? 'application/octet-stream'),
      ...(Number(part?.metadata?.size) > 0 ? { size: Number(part.metadata.size) } : {}),
      ...(String(part?.metadata?.approvalInterruptId ?? part?.metadata?.approval?.interruptId ?? '').trim()
        ? { approvalInterruptId: String(part.metadata.approvalInterruptId ?? part.metadata.approval.interruptId).trim() }
        : {}),
      category: message.role === 'user' ? 'input' : 'output',
    }
  }

  function generatedFilesFromTool(call: any, successfulToolIds: Set<string>, sourceMessageId: string): ConversationFilePreview[] {
    return generatedArtifactsFromTool(call, successfulToolIds).map((artifact: any) => {
      const query = new URLSearchParams({ path: artifact.sourcePath })
      const route = artifact.archive ? '/agui/workspace-archive' : '/agui/workspace-file'
      return {
        id: artifact.id,
        name: artifact.name,
        url: `${dataAgentWebApi(route)}?${query.toString()}`,
        mimeType: artifact.mimeType,
        category: 'output',
        sourceMessageId,
        sourcePath: artifact.sourcePath,
      }
    })
  }

  const deliverables = computed(() => {
    const result: ConversationFilePreview[] = []
    const known = new Set<string>()
    const successfulToolIds = new Set(messages.value
      .filter(message => message.role === 'tool' && !(message as any).error && (message as any).toolCallId)
      .map(message => String((message as any).toolCallId)))
    for (const message of messages.value) {
      const content = (message as any).content
      if ((message as any).activityType === 'dataagent.ui') {
        const delivery = normalizeUiContent(content)
        if (delivery && delivery.status !== 'removed') {
          for (const card of delivery.cards) {
            const id = `${message.id}-${card.id}`
            if (card.kind !== 'file' || known.has(id)) continue
            known.add(id)
            result.push({
              id,
              name: card.name,
              url: card.url,
              mimeType: card.mimeType,
              ...(card.approvalInterruptId ? { approvalInterruptId: card.approvalInterruptId } : {}),
              ...(card.approvalInterruptId ? { approvalResolved: !pendingInterrupts.value.some(interrupt => interrupt.id === card.approvalInterruptId) } : {}),
              category: 'output',
            })
          }
        }
        continue
      }
      if (Array.isArray(content)) {
        content.forEach((part, index) => {
          const file = previewFromPart(message, part, index)
          if (!file || known.has(file.id)) return
          known.add(file.id)
          result.push(file)
        })
      }
      for (const call of (message as any).toolCalls ?? []) {
        for (const removedPath of removedArtifactPathsFromTool(call, successfulToolIds)) {
          const key = artifactPathKey(removedPath)
          for (let index = result.length - 1; index >= 0; index -= 1) {
            if (!result[index]?.sourcePath || artifactPathKey(result[index].sourcePath) !== key) continue
            known.delete(result[index].id)
            result.splice(index, 1)
          }
        }
        for (const file of generatedFilesFromTool(call, successfulToolIds, message.id)) {
          if (known.has(file.id)) continue
          known.add(file.id)
          result.push(file)
        }
      }
    }
    for (const item of attachments.value) {
      if (known.has(item.id)) continue
      result.push({ id: item.id, name: item.file.name, url: item.previewUrl, mimeType: item.file.type || 'application/octet-stream', size: item.file.size, category: 'input' })
    }
    const approval = pendingInterrupts.value.length === 1
      && pendingInterrupts.value[0]?.metadata?.kind === 'form'
      && !result.some(file => file.approvalInterruptId)
      ? pendingInterrupts.value[0]
      : undefined
    const approvalTarget = approval ? [...result].reverse().find(file => file.category === 'output') : undefined
    const versions = new Map<string, number>()
    return result.map(file => {
      if (file.category === 'input') return file
      const key = file.name.trim().toLocaleLowerCase()
      const version = (versions.get(key) ?? 0) + 1
      versions.set(key, version)
      return { ...file, version, ...(file === approvalTarget ? { approvalInterruptId: approval!.id } : {}) }
    })
  })

  // A native write result can arrive a moment before its following form. Keep an
  // already-open preview synchronized when the adapter later binds that form to
  // the latest delivery, so the right-side approval footer does not disappear
  // during this normal streaming race.
  watch(deliverables, files => {
    const current = activePreview.value
    if (!current) return
    const latest = files.find(file => file.id === current.id)
    if (!latest) return
    if (latest.url === current.url
      && latest.name === current.name
      && latest.mimeType === current.mimeType
      && latest.approvalInterruptId === current.approvalInterruptId
      && latest.approvalResolved === current.approvalResolved
      && latest.version === current.version) return
    activePreview.value = { ...current, ...latest }
  }, { deep: true })

  const auditEntries = computed<AuditEntry[]>(() => {
    const entries: AuditEntry[] = []
    for (const message of messages.value) {
      const raw = message as any
      if (message.role === 'user') entries.push({ id: message.id, label: t('chat.submitted'), detail: messageText(message).slice(0, 72) || t('chat.attachmentSubmitted'), tone: 'active' })
      else if (message.role === 'tool') entries.push({ id: message.id, label: raw.error ? t('chat.toolFailed') : t('chat.toolCompleted'), detail: raw.error ? t('chat.canContinue') : t('chat.resultRecorded'), tone: raw.error ? 'warning' : 'success' })
      else if (message.role === 'assistant' && messageText(message).trim()) entries.push({ id: message.id, label: t('chat.generatedAnswer'), detail: messageText(message).slice(0, 72), tone: 'success' })
    }
    pendingInterrupts.value.forEach(interrupt => entries.push({ id: `approval-${interrupt.id}`, label: t('chat.waitingApproval'), detail: t('chat.approvalDetail'), tone: 'warning' }))
    return entries.reverse()
  })


  return { deliverables, auditEntries }
}
