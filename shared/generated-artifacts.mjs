const archivePathPattern = /["']([^"'\r\n]*?\.zip)["']/gi

const parseArguments = (call) => {
  try {
    return JSON.parse(String(call?.function?.arguments ?? '{}'))
  } catch {
    return null
  }
}

const basename = (value) => value.split(/[\\/]/).pop()?.trim() ?? ''

export const artifactPathKey = (value) => String(value ?? '').trim().replace(/\\/g, '/').toLocaleLowerCase()

export function generatedArtifactMimeType(filename) {
  const extension = filename.split('.').pop()?.toLocaleLowerCase()
  if (['md', 'markdown', 'mdx'].includes(extension ?? '')) return 'text/markdown'
  if (extension === 'pdf') return 'application/pdf'
  if (extension === 'json') return 'application/json'
  if (extension === 'csv') return 'text/csv'
  if (extension === 'zip') return 'application/zip'
  if (['yaml', 'yml'].includes(extension ?? '')) return 'application/yaml'
  if (['txt', 'sql', 'xml', 'log'].includes(extension ?? '')) return 'text/plain'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension ?? '')) return `image/${extension === 'jpg' ? 'jpeg' : extension}`
  return 'application/octet-stream'
}

/**
 * Projects only explicit, successfully completed file-producing tool calls.
 * Native writes expose their path directly. Archives usually run through
 * shell/bash, so a successful archive create or verification command may also
 * expose quoted ZIP paths. The preview route remains the authority for path
 * containment and file existence.
 */
export function generatedArtifactsFromTool(call, successfulToolIds) {
  if (!call?.id || !successfulToolIds.has(String(call.id))) return []
  const tool = String(call?.function?.name ?? '').toLocaleLowerCase()
  const input = parseArguments(call)
  if (!input) return []

  if (tool === 'write') {
    const sourcePath = String(input.path ?? '').trim()
    const name = basename(sourcePath)
    return sourcePath && name ? [{ id: `generated-${call.id}`, sourcePath, name, mimeType: generatedArtifactMimeType(name), archive: false }] : []
  }

  if (!['bash', 'shell'].includes(tool)) return []
  const command = String(input.command ?? '')
  if (!/Compress-Archive|ZipFile\]::OpenRead|Get-Item|\b(?:zip|tar)\b/i.test(command)) return []
  const paths = [...command.matchAll(archivePathPattern)].map(match => match[1]?.trim()).filter(Boolean)
  const unique = new Map(paths.map(sourcePath => [artifactPathKey(sourcePath), sourcePath]))
  return [...unique.entries()].map(([normalizedPath, sourcePath]) => ({
    id: `generated-archive:${normalizedPath}`,
    sourcePath,
    name: basename(sourcePath),
    mimeType: 'application/zip',
    archive: true,
  })).filter(item => item.name)
}

export function removedArtifactPathsFromTool(call, successfulToolIds) {
  if (!call?.id || !successfulToolIds.has(String(call.id))) return []
  if (!['bash', 'shell'].includes(String(call?.function?.name ?? '').toLocaleLowerCase())) return []
  const input = parseArguments(call)
  if (!input) return []
  const command = String(input.command ?? '')
  const paths = [...command.matchAll(/Remove-Item\s+["']([^"'\r\n]+)["']/gi)]
    .map(match => match[1]?.trim())
    .filter(Boolean)
  return [...new Map(paths.map(sourcePath => [artifactPathKey(sourcePath), sourcePath])).values()]
}
