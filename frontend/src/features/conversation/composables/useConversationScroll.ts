import { nextTick, ref, type Ref } from 'vue'

export type ConversationScrollController = {
  messageScroller: Ref<HTMLElement | null>
  showJumpToLatest: Ref<boolean>
  scrollToBottom(): void
  followTextReveal(): void
  handleScroll(): Promise<void>
  resetFollowBottom(): void
}

export function useConversationScroll(options: {
  hasMessages: () => boolean
  hasOlder: () => boolean
  loadingOlder: () => boolean
  loadOlder: () => Promise<void>
}): ConversationScrollController {
  const messageScroller = ref<HTMLElement | null>(null)
  const showJumpToLatest = ref(false)
  let followBottom = true
  let previousScrollHeight = 0

  function scrollToBottom() {
    void nextTick().then(() => {
      const element = messageScroller.value
      if (!element) return
      element.scrollTop = element.scrollHeight
      followBottom = true
      showJumpToLatest.value = false
    })
  }

  function followTextReveal() {
    if (followBottom) scrollToBottom()
  }

  async function handleScroll() {
    const element = messageScroller.value
    if (!element) return
    followBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 5 * 16
    showJumpToLatest.value = !followBottom && options.hasMessages()
    if (element.scrollTop > 6 * 16 || !options.hasOlder() || options.loadingOlder()) return
    previousScrollHeight = element.scrollHeight
    await options.loadOlder()
    await nextTick()
    element.scrollTop += Math.max(0, element.scrollHeight - previousScrollHeight)
  }

  function resetFollowBottom() {
    followBottom = true
    showJumpToLatest.value = false
  }

  return { messageScroller, showJumpToLatest, scrollToBottom, followTextReveal, handleScroll, resetFollowBottom }
}
