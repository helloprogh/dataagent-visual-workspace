import { computed, ref } from 'vue'
import { fetchConversationSessions } from '../api/history'
import type { ConversationSession } from '../types'

const ACTIVE_KEY = 'dataagent.conversations.active.v3'
const ALIAS_KEY = 'dataagent.conversations.aliases.v1'

function readAliases(): Record<string, string> {
  try {
    const value = JSON.parse(localStorage.getItem(ALIAS_KEY) ?? '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch { return {} }
}

export function useSessions() {
  const sessions = ref<ConversationSession[]>([])
  const linkedSession = new URLSearchParams(window.location.search).get('session')?.trim() ?? ''
  const activeId = ref(linkedSession || localStorage.getItem(ACTIVE_KEY) || '')
  const aliases = ref<Record<string, string>>(readAliases())
  const loading = ref(false)
  const error = ref('')

  const decoratedSessions = computed(() => sessions.value.map(session => ({
    ...session,
    displayName: aliases.value[session.id] || session.displayName,
  })))
  const rootSessions = computed(() => decoratedSessions.value.filter(session => !session.parentId && session.archivedAt == null))
  const activeSession = computed(() => rootSessions.value.find(session => session.id === activeId.value))

  function setActive(id: string) {
    activeId.value = id
    if (id) {
      localStorage.setItem(ACTIVE_KEY, id)
    } else {
      localStorage.removeItem(ACTIVE_KEY)
    }
  }

  function startNew() {
    setActive('')
  }

  function select(id: string) {
    setActive(id)
  }

  function rename(id: string, name: string) {
    const normalized = name.trim()
    if (!normalized) return
    aliases.value = { ...aliases.value, [id]: normalized }
    localStorage.setItem(ALIAS_KEY, JSON.stringify(aliases.value))
  }

  function materialize(id: string, displayName: string) {
    if (!sessions.value.some(item => item.id === id)) {
      const now = Date.now()
      sessions.value = [{ id, displayName, createdAt: now, updatedAt: now }, ...sessions.value]
    }
    if (displayName.trim()) rename(id, displayName)
    setActive(id)
  }

  async function refresh(initial = false) {
    if (initial) loading.value = true
    error.value = ''
    try {
      sessions.value = await fetchConversationSessions()
      if (activeId.value && !rootSessions.value.some(item => item.id === activeId.value)) {
        setActive(rootSessions.value[0]?.id ?? '')
      }
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
    } finally {
      loading.value = false
    }
  }

  return {
    sessions: decoratedSessions,
    rootSessions,
    activeId,
    activeSession,
    loading,
    error,
    refresh,
    startNew,
    select,
    rename,
    materialize,
  }
}
