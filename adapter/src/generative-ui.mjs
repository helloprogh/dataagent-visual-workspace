import { activitySnapshot, activityDelta } from './agui.mjs'
import { UI_ACTIVITY_TYPE, normalizeUiContent, applyUiPatch } from '../../shared/generative-ui.mjs'

export class GenerativeUiStream {
  constructor(threadId, runId) {
    this.threadId = threadId
    this.runId = runId
    this.snapshots = new Map()
  }

  publish(value, parentMessageId) {
    const content = normalizeUiContent(value)
    if (!content || typeof parentMessageId !== 'string' || !parentMessageId) return []
    const messageId = `ui-${this.runId}-${content.surfaceId}`
    const previous = this.snapshots.get(messageId)
    if (previous && JSON.stringify(previous.content) === JSON.stringify(content)) return []
    const snapshot = { ...activitySnapshot(messageId, UI_ACTIVITY_TYPE, content),
      threadId: this.threadId, runId: this.runId, parentMessageId: previous?.parentMessageId ?? parentMessageId }
    this.snapshots.set(messageId, snapshot)
    return [snapshot]
  }

  accept(source, sessionId) {
    if (source.activityType !== UI_ACTIVITY_TYPE || source.threadId !== this.threadId
      || source.runId !== this.runId || (source.sessionID && source.sessionID !== sessionId)) return []
    if (source.type === 'ACTIVITY_SNAPSHOT') return this.publish(source.content, source.parentMessageId)
    if (source.type !== 'ACTIVITY_DELTA') return []
    const previous = this.snapshots.get(source.messageId)
    const content = applyUiPatch(previous?.content, source.patch)
    if (!content) return []
    const snapshots = this.publish(content, previous.parentMessageId)
    if (!snapshots.length) return []
    // Send normalized values so the browser and persisted snapshot stay identical.
    const patch = source.patch.map(operation => ({ ...operation, value: content[operation.path.slice(1)] }))
    return [{ ...activityDelta(source.messageId, UI_ACTIVITY_TYPE, patch), threadId: this.threadId, runId: this.runId }]
  }

  bindNextInterrupt(interrupt) {
    if (!interrupt?.id) return []
    const candidates = []
    for (const snapshot of this.snapshots.values()) {
      if (snapshot.content.status !== 'ready') continue
      snapshot.content.cards.forEach((card, index) => {
        if (card.kind === 'file' && card.approvalMode === 'next-interrupt' && !card.approvalInterruptId) {
          candidates.push({ snapshot, index })
        }
      })
    }
    // Never guess which deliverable an approval belongs to. Ambiguous runs keep
    // the ordinary interrupt card instead of wiring an action to the wrong file.
    if (candidates.length !== 1) return []
    const [{ snapshot, index }] = candidates
    const cards = snapshot.content.cards.map((card, cardIndex) => cardIndex === index
      ? { ...card, approvalInterruptId: String(interrupt.id) }
      : card)
    return this.publish({ ...snapshot.content, cards }, snapshot.parentMessageId)
  }

  finish() {
    return [...this.snapshots.values()].flatMap(snapshot => snapshot.content.status === 'generating'
      ? this.publish({ ...snapshot.content, status: 'error', summary: '生成已结束，但未收到完整结果。' }, snapshot.parentMessageId)
      : [])
  }
}
