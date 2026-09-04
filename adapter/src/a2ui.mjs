import { activitySnapshot } from './agui.mjs'
import {
  A2UI_ACTIVITY_TYPE,
  A2UI_CATALOG_ID,
  A2UI_VERSION,
  normalizeRenderA2uiArgs,
} from '../../shared/a2ui.mjs'

const operationSurfaceId = operation => operation?.createSurface?.surfaceId
  ?? operation?.updateComponents?.surfaceId
  ?? operation?.updateDataModel?.surfaceId
  ?? operation?.deleteSurface?.surfaceId

export const isRenderA2uiTool = name => String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').endsWith('rendera2ui')

export class A2uiStream {
  constructor(threadId, runId, restored = []) {
    this.threadId = threadId
    this.runId = runId
    this.snapshots = new Map(restored
      .filter(item => item?.activityType === A2UI_ACTIVITY_TYPE && typeof item.messageId === 'string')
      .map(item => [item.messageId, item]))
  }

  publish(value, parentMessageId) {
    const input = normalizeRenderA2uiArgs(value)
    if (!input || typeof parentMessageId !== 'string' || !parentMessageId) return []
    const messageId = `a2ui-${input.surfaceId}`
    const previous = this.snapshots.get(messageId)
    const operations = input.components.length
      ? [
          { version: A2UI_VERSION, createSurface: { surfaceId: input.surfaceId, catalogId: A2UI_CATALOG_ID } },
          { version: A2UI_VERSION, updateComponents: { surfaceId: input.surfaceId, components: input.components } },
          ...(input.data === undefined ? [] : [{ version: A2UI_VERSION, updateDataModel: { surfaceId: input.surfaceId, path: '/', value: input.data } }]),
        ]
      : [{ version: A2UI_VERSION, deleteSurface: { surfaceId: input.surfaceId } }]
    const content = { a2ui_operations: operations }
    if (previous && JSON.stringify(previous.content) === JSON.stringify(content)) return []
    const snapshot = {
      ...activitySnapshot(messageId, A2UI_ACTIVITY_TYPE, content),
      threadId: this.threadId,
      runId: this.runId,
      parentMessageId: previous?.parentMessageId ?? parentMessageId,
    }
    this.snapshots.set(messageId, snapshot)
    return [snapshot]
  }

  accept(source, sessionId) {
    if (source.activityType !== A2UI_ACTIVITY_TYPE || source.threadId !== this.threadId
      || source.runId !== this.runId || (source.sessionID && source.sessionID !== sessionId)
      || source.type !== 'ACTIVITY_SNAPSHOT') return []
    const operations = source.content?.a2ui_operations ?? source.content?.operations
    if (!Array.isArray(operations) || !operations.length) return []
    const surfaceId = operations.map(operationSurfaceId).find(Boolean)
    if (!surfaceId) return []
    const componentOperation = operations.find(operation => operation?.updateComponents?.surfaceId === surfaceId)
    const dataOperation = operations.find(operation => operation?.updateDataModel?.surfaceId === surfaceId)
    const deleted = operations.some(operation => operation?.deleteSurface?.surfaceId === surfaceId)
    return this.publish({
      surfaceId,
      components: deleted ? [] : componentOperation?.updateComponents?.components,
      ...(dataOperation ? { data: dataOperation.updateDataModel.value } : {}),
    }, source.parentMessageId)
  }
}
