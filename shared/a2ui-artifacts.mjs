import { safeUiFileUrl } from './generative-ui.mjs'

// File metadata is a side table, never executable UI or approval authority.
export function normalizeA2uiArtifacts(value) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 100) return null
  try { if (JSON.stringify(value).length > 65536) return null } catch { return null }
  const seen = new Set()
  const result = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || !/^[A-Za-z0-9_-]{1,64}$/.test(item.id)
      || typeof item.id !== 'string' || seen.has(item.id)) return null
    const url = safeUiFileUrl(item.url)
    if (!url || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 200
      || typeof item.mimeType !== 'string' || !item.mimeType || item.mimeType.length > 120) return null
    seen.add(item.id)
    result.push({ id: item.id, name: item.name, url, mimeType: item.mimeType, category: 'output' })
  }
  return result
}
