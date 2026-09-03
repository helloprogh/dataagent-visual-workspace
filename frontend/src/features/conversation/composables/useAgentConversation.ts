import { onBeforeUnmount, ref, shallowRef } from 'vue'
import type { HttpAgent, Interrupt, Message, ResumeEntry } from '@ag-ui/client'
import { createAgentClient, createHydrationClient } from '../../../agui/client'
import { fetchConversationMessagePage } from '../api/history'
import { createConversation, interruptConversation, uploadConversationFile } from '../api/session'
import type { ModelSelection } from '../../model/types'
import { publishAndRun } from '../sendLifecycle'

export type SendReceipt = { sessionId: string; created: boolean; initialName?: string }

export type PendingAttachment = {
  id: string
  file: File
  previewUrl: string
}

export function useAgentConversation() {
  const agent = shallowRef<HttpAgent | null>(null)
  const threadId = ref('')
  const messages = ref<Message[]>([])
  const running = ref(false)
  const hydrating = ref(false)
  const loadingOlder = ref(false)
  const nextCursor = ref<string>()
  const pendingInterrupts = ref<Interrupt[]>([])
  const attachments = ref<PendingAttachment[]>([])
  const error = ref('')
  const stopped = ref(false)
  let subscription: { unsubscribe: () => void } | null = null
  let hydrationSubscription: { unsubscribe: () => void } | null = null
  let hydrationAgent: HttpAgent | null = null
  let generation = 0
  let ignoreCancellationErrorsUntil = 0
  const previewUrls = new Set<string>()

  function syncMessages() {
    messages.value = agent.value ? [...agent.value.messages] : []
  }

  function detachHydration() {
    hydrationSubscription?.unsubscribe()
    hydrationSubscription = null
    hydrationAgent?.abortRun()
    hydrationAgent = null
  }

  function detach() {
    subscription?.unsubscribe()
    subscription = null
    detachHydration()
    if (agent.value?.isRunning) agent.value.abortRun()
    agent.value = null
    messages.value = []
    pendingInterrupts.value = []
    nextCursor.value = undefined
    previewUrls.forEach(url => URL.revokeObjectURL(url))
    previewUrls.clear()
    attachments.value = []
    running.value = false
    stopped.value = false
  }

  function bind(next: HttpAgent) {
    subscription?.unsubscribe()
    subscription = next.subscribe({
      onMessagesChanged: ({ messages: nextMessages }) => {
        messages.value = [...nextMessages]
      },
      onRunFinishedEvent: ({ event }) => {
        pendingInterrupts.value = event.outcome?.type === 'interrupt'
          ? [...event.outcome.interrupts]
          : []
      },
      onRunErrorEvent: ({ event }) => {
        if (Date.now() < ignoreCancellationErrorsUntil && /abort|aborted|cancelled|canceled|interrupt|中止|取消/i.test(event.message)) return
        error.value = event.message
      },
    })
  }

  async function hydratePendingInterrupts(sessionId: string, currentGeneration: number) {
    const client = createHydrationClient(sessionId)
    hydrationAgent = client
    hydrationSubscription = client.subscribe({
      onRunFinishedEvent: ({ event }) => {
        if (currentGeneration !== generation) return
        pendingInterrupts.value = event.outcome?.type === 'interrupt'
          ? [...event.outcome.interrupts]
          : []
      },
      onRunErrorEvent: ({ event }) => {
        if (currentGeneration === generation) error.value = event.message
      },
    })

    try {
      await client.runAgent({
        forwardedProps: {
          dataagent: { mode: 'hydrate' },
        },
      } as any)
    } finally {
      if (hydrationAgent === client) detachHydration()
    }
  }

  async function open(sessionId: string) {
    const id = sessionId.trim()
    const currentGeneration = ++generation
    detach()
    threadId.value = id
    error.value = ''
    if (!id) return

    hydrating.value = true
    try {
      const page = await fetchConversationMessagePage(id)
      if (currentGeneration !== generation) return
      const next = createAgentClient(id)
      next.setMessages(page.messages)
      agent.value = next
      nextCursor.value = page.nextCursor
      bind(next)
      syncMessages()
      await hydratePendingInterrupts(id, currentGeneration)
    } catch (reason) {
      if (currentGeneration === generation) error.value = reason instanceof Error ? reason.message : String(reason)
    } finally {
      if (currentGeneration === generation) hydrating.value = false
    }
  }

  async function loadOlder() {
    const id = threadId.value
    const cursor = nextCursor.value
    const target = agent.value
    if (!id || !cursor || !target || loadingOlder.value) return
    loadingOlder.value = true
    try {
      const page = await fetchConversationMessagePage(id, cursor)
      const known = new Set(target.messages.map(message => message.id))
      const older = page.messages.filter(message => !known.has(message.id))
      if (older.length) target.setMessages([...older, ...target.messages])
      nextCursor.value = page.nextCursor
      syncMessages()
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
    } finally {
      loadingOlder.value = false
    }
  }

  function stageFiles(files: FileList | File[]) {
    const source = Array.from(files)
    const pending = source.map(file => {
      const previewUrl = URL.createObjectURL(file)
      previewUrls.add(previewUrl)
      return { id: crypto.randomUUID(), file, previewUrl }
    })
    attachments.value = [
      ...attachments.value,
      ...pending,
    ]
  }

  function removeAttachment(id: string) {
    const removed = attachments.value.find(item => item.id === id)
    if (removed) {
      URL.revokeObjectURL(removed.previewUrl)
      previewUrls.delete(removed.previewUrl)
    }
    attachments.value = attachments.value.filter(item => item.id !== id)
  }

  async function ensureAgent(model: ModelSelection, initialText: string) {
    if (agent.value && threadId.value) return { client: agent.value, sessionId: threadId.value, created: false }
    const sessionId = await createConversation(model)
    const client = createAgentClient(sessionId)
    agent.value = client
    threadId.value = sessionId
    bind(client)
    return { client, sessionId, created: true, initialName: deriveConversationName(initialText) }
  }

  async function send(text: string, model: ModelSelection, onAccepted?: (receipt: SendReceipt) => void) {
    const value = text.trim()
    if ((!value && !attachments.value.length) || running.value || pendingInterrupts.value.length) return null
    error.value = ''
    stopped.value = false
    running.value = true
    try {
      const prepared = await ensureAgent(model, value)
      const uploaded = []
      for (const item of attachments.value) {
        const file = await uploadConversationFile(item.file, prepared.sessionId)
        uploaded.push({
          ...file,
          metadata: { ...file.metadata, clientPreviewUrl: item.previewUrl },
        })
      }
      const content = uploaded.length
        ? [
            ...(value ? [{ type: 'text', text: value }] : []),
            ...uploaded,
          ]
        : value
      const userMessage = {
        id: `msg-${crypto.randomUUID()}`,
        role: 'user',
        content,
      } as Message
      await publishAndRun(prepared, () => {
        prepared.client.addMessage(userMessage)
        attachments.value = []
        syncMessages()
      }, onAccepted, () => prepared.client.runAgent())
      syncMessages()
      return prepared
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
      throw reason
    } finally {
      running.value = false
    }
  }

  async function resume(entries: ResumeEntry[]) {
    const target = agent.value
    if (!target || running.value || !pendingInterrupts.value.length) return
    const required = new Set(pendingInterrupts.value.map(item => item.id))
    const provided = new Set(entries.map(item => item.interruptId))
    if (required.size !== provided.size || [...required].some(id => !provided.has(id))) {
      throw new Error('必须一次处理当前 Run 的全部待处理中断')
    }
    const previousInterrupts = [...pendingInterrupts.value]
    const previousAgentInterrupts = [...target.pendingInterrupts]
    stopped.value = false
    running.value = true
    error.value = ''
    try {
      pendingInterrupts.value = []
      await target.runAgent({ resume: entries } as any)
      // A rejected native permission ends with RUN_ERROR in OpenCode even
      // though the interrupt itself was resolved successfully. AG-UI only
      // clears its internal queue on RUN_FINISHED, so clear it explicitly once
      // the resume request has been accepted by the adapter.
      target.pendingInterrupts = []
      syncMessages()
    } catch (reason) {
      pendingInterrupts.value = previousInterrupts
      target.pendingInterrupts = previousAgentInterrupts
      error.value = reason instanceof Error ? reason.message : String(reason)
      throw reason
    } finally {
      running.value = false
    }
  }

  async function retry() {
    const target = agent.value
    if (!target || running.value || pendingInterrupts.value.length) return false
    stopped.value = false
    error.value = ''
    running.value = true
    try {
      await target.runAgent()
      syncMessages()
      return true
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
      throw reason
    } finally {
      running.value = false
    }
  }

  async function stop() {
    const id = threadId.value
    const target = agent.value
    ignoreCancellationErrorsUntil = Date.now() + 5000
    stopped.value = true
    error.value = ''
    target?.abortRun()
    running.value = false
    if (id) await interruptConversation(id)
  }

  function deriveConversationName(value: string) {
    const normalized = value.replace(/\s+/g, ' ').trim()
    if (!normalized) return '新需求'
    return normalized.length > 28 ? `${normalized.slice(0, 28)}…` : normalized
  }

  onBeforeUnmount(() => {
    generation += 1
    detach()
  })

  return {
    agent,
    threadId,
    messages,
    running,
    hydrating,
    loadingOlder,
    nextCursor,
    pendingInterrupts,
    attachments,
    error,
    stopped,
    open,
    loadOlder,
    stageFiles,
    removeAttachment,
    send,
    resume,
    retry,
    stop,
  }
}
