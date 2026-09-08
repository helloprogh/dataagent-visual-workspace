import { interruptFromForm } from './converter.mjs'
import { interruptFromPermission } from './permission-interrupt.mjs'

// Refresh only kinds the upstream successfully listed. An unavailable endpoint
// must never be treated as proof that an approval was resolved.
export async function reconcileInterrupts(client, sessionId, cached) {
  const snapshots = await Promise.all([
    ['form', 'listForms', interruptFromForm],
    ['permission', 'listPermissions', interruptFromPermission],
  ].map(async ([kind, method, convert]) => {
    if (typeof client[method] !== 'function') return [kind, null]
    try {
      const raw = await client[method](sessionId)
      if (!Array.isArray(raw)) return [kind, null]
      const fresh = raw.map(item => convert(item))
      if (fresh.some(item => !item)) return [kind, null]
      return [kind, fresh]
    } catch { return [kind, null] }
  }))
  let result = [...cached]
  for (const [kind, fresh] of snapshots) {
    if (!fresh) continue
    const previous = new Map(cached.map(item => [item.id, item]))
    result = result.filter(item => {
      const cachedKind = item.metadata?.kind ?? (item.metadata?.source === 'opencode2' && item.metadata?.action ? 'permission' : undefined)
      return cachedKind !== kind
    })
    for (const item of fresh) {
      const old = previous.get(item.id)
      result = result.filter(candidate => candidate.id !== item.id)
      result.push({ ...old, ...item, ...(item.toolCallId || !old?.toolCallId ? {} : { toolCallId: old.toolCallId, reason: 'tool_call' }) })
    }
  }
  return result
}
