type JsonObject = Record<string, any>

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function operationSurfaceId(operation: JsonObject): string {
  return operation.surfaceId
    ?? operation.beginRendering?.surfaceId
    ?? operation.surfaceUpdate?.surfaceId
    ?? operation.dataModelUpdate?.surfaceId
    ?? operation.deleteSurface?.surfaceId
    ?? operation.createSurface?.surfaceId
    ?? operation.updateComponents?.surfaceId
    ?? operation.updateDataModel?.surfaceId
    ?? 'default'
}

function sanitizeComponents(raw: unknown, allowed: ReadonlySet<string>): JsonObject[] {
  if (!Array.isArray(raw)) return []
  const components: JsonObject[] = []
  const byId = new Map<string, JsonObject>()

  raw.forEach((value, index) => {
    const source = isObject(value) ? value : {}
    const id = typeof source.id === 'string' && source.id ? source.id : `invalid-${index}`
    const type = source.component
    if (typeof type !== 'string' || !allowed.has(type)) {
      const fallback = {
        component: 'Text',
        id,
        text: typeof type === 'string' ? `Unknown component: ${type}` : `Invalid component: ${id}`,
      }
      components.push(fallback)
      byId.set(id, fallback)
      return
    }
    const clean = { ...source, id, component: type }
    components.push(clean)
    byId.set(id, clean)
  })

  let cycleSequence = 0
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const visit = (id: string) => {
    if (visited.has(id)) return
    const component = byId.get(id)
    if (!component) return
    visiting.add(id)
    if (Array.isArray(component.children)) {
      component.children = component.children.map((child: unknown) => {
        const childId = typeof child === 'string' ? child : isObject(child) ? child.id : undefined
        if (typeof childId !== 'string') return child
        if (visiting.has(childId)) {
          const placeholderId = `cycle-${cycleSequence++}`
          const placeholder = { component: 'Text', id: placeholderId, text: `Cycle blocked: ${id} -> ${childId}` }
          components.push(placeholder)
          byId.set(placeholderId, placeholder)
          return typeof child === 'string' ? placeholderId : isObject(child) ? { ...child, id: placeholderId } : child
        }
        visit(childId)
        return child
      })
    }
    visiting.delete(id)
    visited.add(id)
  }
  for (const id of byId.keys()) visit(id)
  return components
}

export function sanitizeA2uiOperations(raw: unknown, allowedComponents: ReadonlySet<string>): JsonObject[] {
  if (!Array.isArray(raw)) return []
  const active = new Set<string>()
  const result: JsonObject[] = []

  for (const value of raw) {
    if (!isObject(value)) continue
    const operation = { ...value }
    const surfaceId = String(operationSurfaceId(operation))
    const creates = isObject(operation.createSurface) || isObject(operation.beginRendering)
    const deletes = isObject(operation.deleteSurface)
    const updates = isObject(operation.updateComponents) || isObject(operation.surfaceUpdate)
    const updatesData = isObject(operation.updateDataModel) || isObject(operation.dataModelUpdate)

    if (creates) {
      if (active.has(surfaceId)) continue
      active.add(surfaceId)
      result.push(operation)
      continue
    }
    if (deletes) {
      // A delete snapshot can legitimately arrive on its own after the
      // previous surface state was persisted. Keep it even when this batch
      // has no create operation; callers use it to suppress the old card.
      if (typeof operation.deleteSurface?.surfaceId !== 'string' || !operation.deleteSurface.surfaceId) continue
      active.delete(surfaceId)
      result.push(operation)
      continue
    }
    if (updates || updatesData) {
      if (!active.has(surfaceId)) continue
      if (isObject(operation.updateComponents)) {
        operation.updateComponents = {
          ...operation.updateComponents,
          components: sanitizeComponents(operation.updateComponents.components, allowedComponents),
        }
      }
      if (isObject(operation.surfaceUpdate) && 'components' in operation.surfaceUpdate) {
        operation.surfaceUpdate = {
          ...operation.surfaceUpdate,
          components: sanitizeComponents(operation.surfaceUpdate.components, allowedComponents),
        }
      }
      result.push(operation)
    }
  }
  return result
}

const RETIRED_APPROVAL_NAMES = new Set(['request_user_confirm', 'hitl_confirm', 'hitl_cancel'])

export function containsRetiredA2uiApproval(value: unknown): boolean {
  const seen = new WeakSet<object>()
  const visit = (candidate: unknown, depth: number): boolean => {
    if (depth > 24 || candidate == null) return false
    if (typeof candidate === 'string') return RETIRED_APPROVAL_NAMES.has(candidate)
    if (typeof candidate !== 'object') return false
    if (seen.has(candidate)) return false
    seen.add(candidate)
    if (Array.isArray(candidate)) return candidate.some(item => visit(item, depth + 1))
    return Object.entries(candidate as Record<string, unknown>).some(([key, nested]) =>
      ((key === 'name' || key === 'toolName') && typeof nested === 'string' && RETIRED_APPROVAL_NAMES.has(nested))
      || visit(nested, depth + 1),
    )
  }
  return visit(value, 0)
}
