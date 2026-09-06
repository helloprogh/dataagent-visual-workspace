import { nextTick, onScopeDispose, ref, watch, type Ref } from 'vue'

type ScrollState = {
  sessionId: Readonly<Ref<string | undefined>>
  messages: Readonly<Ref<readonly unknown[]>>
  hydrating: Readonly<Ref<boolean>>
  loadingOlder: Readonly<Ref<boolean>>
  nextCursor: Readonly<Ref<string | undefined | null>>
  loadOlder: () => Promise<unknown>
}

/** Owns viewport state only; history and run state remain in the runtime. */
export function useConversationScroll(state: ScrollState) {
  const messageScroller = ref<HTMLElement | null>(null)
  const showJumpToLatest = ref(false)
  let followBottom = true
  let generation = 0
  let disposed = false
  let pagination: symbol | undefined

  function enableFollowing() { followBottom = true }

  async function scrollToBottom() {
    const current = generation
    await nextTick()
    if (disposed || current !== generation) return
    const element = messageScroller.value
    if (!element) return
    element.scrollTop = element.scrollHeight
    followBottom = true
    showJumpToLatest.value = false
  }

  function followTextReveal() {
    if (followBottom && !pagination) void scrollToBottom()
  }

  async function loadEarlier() {
    const element = messageScroller.value
    if (!element || disposed || pagination || state.hydrating.value || !state.nextCursor.value || state.loadingOlder.value) return
    const current = generation
    const token = Symbol('pagination')
    pagination = token
    const previousHeight = element.scrollHeight
    followBottom = false
    try {
      await state.loadOlder()
      await nextTick()
      if (disposed || current !== generation || element !== messageScroller.value) return
      element.scrollTop += Math.max(0, element.scrollHeight - previousHeight)
      showJumpToLatest.value = element.scrollHeight - element.scrollTop - element.clientHeight >= 80
    } finally {
      if (pagination === token) pagination = undefined
    }
  }

  async function handleScroll() {
    const element = messageScroller.value
    if (!element || state.hydrating.value) return
    followBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 80
    showJumpToLatest.value = !followBottom && Boolean(state.messages.value.length)
    if (element.scrollTop <= 96) await loadEarlier()
  }

  watch(state.sessionId, () => {
    generation++
    pagination = undefined
    followBottom = true
    showJumpToLatest.value = false
  }, { flush: 'sync' })
  watch(state.messages, followTextReveal, { deep: true })
  // Hydration removes the skeleton before the final history height exists.
  watch(state.hydrating, value => { if (!value) void scrollToBottom() })
  onScopeDispose(() => { disposed = true; generation++ })

  return { messageScroller, showJumpToLatest, enableFollowing, scrollToBottom, followTextReveal, handleScroll, loadEarlier }
}
