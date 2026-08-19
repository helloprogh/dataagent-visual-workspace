import { chmod, mkdir, mkdtemp, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { applyCors } from './sse.mjs'

const MAX_PACKAGE_BYTES = Number(process.env.OPENCODE_SKILL_PACKAGE_MAX_BYTES ?? 20 * 1024 * 1024)
const MAX_UNPACKED_BYTES = Number(process.env.OPENCODE_SKILL_UNPACKED_MAX_BYTES ?? 64 * 1024 * 1024)
const MAX_ZIP_ENTRIES = Number(process.env.OPENCODE_SKILL_MAX_ENTRIES ?? 512)

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const sendJson = (res, status, body) => {
  applyCors(res)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

const readRawBody = async (req, limit = MAX_PACKAGE_BYTES) => {
  const declared = Number(req.headers['content-length'] ?? 0)
  if (declared > limit) throw new HttpError(413, `Skill package exceeds ${limit} bytes`)
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > limit) throw new HttpError(413, `Skill package exceeds ${limit} bytes`)
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

const readJsonBody = async (req) => {
  const raw = await readRawBody(req, 1024 * 1024)
  if (!raw.length) return {}
  try {
    return JSON.parse(raw.toString('utf8'))
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON')
  }
}

const exists = async (target) => {
  try {
    await stat(target)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

const normalizedZipPath = (value) => {
  if (!value || value.includes('\0')) throw new HttpError(400, 'Skill package contains an invalid path')
  const forward = value.replace(/\\/g, '/')
  if (forward.startsWith('/') || /^[A-Za-z]:\//.test(forward)) {
    throw new HttpError(400, `Skill package contains an absolute path: ${value}`)
  }
  const normalized = path.posix.normalize(forward).replace(/^\.\//, '')
  if (!normalized || normalized === '..' || normalized.startsWith('../')) {
    throw new HttpError(400, `Skill package contains an unsafe path: ${value}`)
  }
  return normalized
}

const findEndOfCentralDirectory = (buffer) => {
  const minimum = Math.max(0, buffer.length - 22 - 0xffff)
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset
  }
  throw new HttpError(400, 'Uploaded file is not a supported ZIP package')
}

const parseZip = (buffer) => {
  if (buffer.length < 22) throw new HttpError(400, 'Uploaded ZIP package is incomplete')
  const eocd = findEndOfCentralDirectory(buffer)
  const entryCount = buffer.readUInt16LE(eocd + 10)
  const centralSize = buffer.readUInt32LE(eocd + 12)
  const centralOffset = buffer.readUInt32LE(eocd + 16)
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new HttpError(400, 'ZIP64 skill packages are not supported')
  }
  if (entryCount > MAX_ZIP_ENTRIES) throw new HttpError(400, `Skill package contains too many files (max ${MAX_ZIP_ENTRIES})`)
  if (centralOffset + centralSize > buffer.length) throw new HttpError(400, 'ZIP central directory is invalid')

  const entries = []
  let cursor = centralOffset
  let unpackedTotal = 0
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new HttpError(400, 'ZIP central directory entry is invalid')
    }
    const flags = buffer.readUInt16LE(cursor + 8)
    const method = buffer.readUInt16LE(cursor + 10)
    const compressedSize = buffer.readUInt32LE(cursor + 20)
    const uncompressedSize = buffer.readUInt32LE(cursor + 24)
    const filenameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    const externalAttributes = buffer.readUInt32LE(cursor + 38)
    const localOffset = buffer.readUInt32LE(cursor + 42)
    const nameStart = cursor + 46
    const nameEnd = nameStart + filenameLength
    if (nameEnd > buffer.length) throw new HttpError(400, 'ZIP filename is invalid')
    if (flags & 0x1) throw new HttpError(400, 'Encrypted ZIP entries are not supported')
    if (![0, 8].includes(method)) throw new HttpError(400, `ZIP compression method ${method} is not supported`)

    const rawName = buffer.subarray(nameStart, nameEnd).toString('utf8')
    const name = normalizedZipPath(rawName)
    const isDirectory = rawName.endsWith('/')
    const unixMode = (externalAttributes >>> 16) & 0xffff
    if ((unixMode & 0o170000) === 0o120000) {
      throw new HttpError(400, `Symbolic links are not allowed in skill packages: ${name}`)
    }

    let data = Buffer.alloc(0)
    if (!isDirectory) {
      if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) {
        throw new HttpError(400, `ZIP local header is invalid for ${name}`)
      }
      const localNameLength = buffer.readUInt16LE(localOffset + 26)
      const localExtraLength = buffer.readUInt16LE(localOffset + 28)
      const dataStart = localOffset + 30 + localNameLength + localExtraLength
      const dataEnd = dataStart + compressedSize
      if (dataEnd > buffer.length) throw new HttpError(400, `ZIP data is incomplete for ${name}`)
      const compressed = buffer.subarray(dataStart, dataEnd)
      try {
        data = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed)
      } catch {
        throw new HttpError(400, `Unable to decompress ${name}`)
      }
      if (data.length !== uncompressedSize) throw new HttpError(400, `ZIP size mismatch for ${name}`)
      unpackedTotal += data.length
      if (unpackedTotal > MAX_UNPACKED_BYTES) {
        throw new HttpError(413, `Unpacked skill package exceeds ${MAX_UNPACKED_BYTES} bytes`)
      }
    }

    entries.push({ name, isDirectory, data, mode: unixMode & 0o777 })
    cursor = nameEnd + extraLength + commentLength
  }
  return entries
}

const skillIdFromPackage = (packageName) => {
  const base = path.basename(packageName || 'uploaded-skill.zip').replace(/\.zip$/i, '')
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
  if (!slug) throw new HttpError(400, 'Unable to derive a Skill id from the package name')
  return slug
}

const describeSkillPackage = (entries, packageName) => {
  const manifests = entries.filter((entry) => !entry.isDirectory && path.posix.basename(entry.name) === 'SKILL.md')
  if (manifests.length === 0) throw new HttpError(400, 'Skill package must contain SKILL.md')
  if (manifests.length > 1) throw new HttpError(400, 'Upload one Skill per package; multiple SKILL.md files were found')
  const manifest = manifests[0]
  const root = path.posix.dirname(manifest.name) === '.' ? '' : path.posix.dirname(manifest.name)
  const sourceId = root ? path.posix.basename(root) : skillIdFromPackage(packageName)
  const id = sourceId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
  if (!id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new HttpError(400, 'Skill id must resolve to lowercase kebab-case')
  }
  const selected = entries.filter((entry) => {
    if (!root) return !entry.name.startsWith('__MACOSX/')
    return entry.name === root || entry.name.startsWith(`${root}/`)
  })
  return { id, root, entries: selected }
}

const extractSkill = async (description, destination) => {
  for (const entry of description.entries) {
    const relative = description.root
      ? entry.name.slice(description.root.length).replace(/^\//, '')
      : entry.name
    if (!relative) continue
    const output = path.resolve(destination, ...relative.split('/'))
    const root = path.resolve(destination)
    if (output !== root && !output.startsWith(`${root}${path.sep}`)) {
      throw new HttpError(400, `Skill package path escapes destination: ${relative}`)
    }
    if (entry.isDirectory) {
      await mkdir(output, { recursive: true })
      continue
    }
    await mkdir(path.dirname(output), { recursive: true })
    await writeFile(output, entry.data)
    if (entry.mode) await chmod(output, entry.mode).catch(() => undefined)
  }
  if (!await exists(path.join(destination, 'SKILL.md'))) {
    throw new HttpError(400, 'Skill package did not produce a root SKILL.md')
  }
}

const workspaceDirectory = (workspace) => workspace?.directory ?? workspace?.path ?? workspace?.worktree

const installSkillPackage = async (client, req, url) => {
  const packageName = String(req.headers['x-skill-package-name'] ?? 'uploaded-skill.zip')
  if (!packageName.toLowerCase().endsWith('.zip')) throw new HttpError(400, 'Skill package must be a .zip file')
  const scope = url.searchParams.get('scope') || 'global'
  if (!['global', 'workspace'].includes(scope)) throw new HttpError(400, 'Skill scope must be global or workspace')
  const replace = url.searchParams.get('replace') === 'true'
  const workspaceID = url.searchParams.get('workspaceID') || undefined

  let sourceDirectory
  let parent
  if (scope === 'global') {
    const configRoot = process.env.XDG_CONFIG_HOME || path.join(homedir(), '.config')
    parent = path.join(configRoot, 'opencode', 'skills')
  } else {
    if (!workspaceID) throw new HttpError(400, 'workspaceID is required for workspace-scoped Skill installation')
    const workspace = await client.getWorkspace(workspaceID)
    sourceDirectory = workspaceDirectory(workspace)
    if (!sourceDirectory) throw new HttpError(502, 'OpenCode workspace did not return a directory')
    parent = path.join(sourceDirectory, '.opencode', 'skills')
  }

  const zip = await readRawBody(req)
  const description = describeSkillPackage(parseZip(zip), packageName)
  await mkdir(parent, { recursive: true })
  const target = path.join(parent, description.id)
  if (await exists(target)) {
    if (!replace) throw new HttpError(409, `Skill ${description.id} already exists in ${scope} scope`)
    await rm(target, { recursive: true, force: true })
  }

  const temporary = await mkdtemp(path.join(parent, `.dataagent-${description.id}-`))
  try {
    await extractSkill(description, temporary)
    await rename(temporary, target)
  } catch (error) {
    await rm(temporary, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }

  return {
    id: description.id,
    scope,
    workspaceID,
    directory: target,
    sourceDirectory,
  }
}

export const createOpenCodeManagementHandler = (client) => async (req, res, url) => {
  if (!url.pathname.startsWith('/api/opencode/')) return false
  try {
    if (req.method === 'GET' && url.pathname === '/api/opencode/health') {
      sendJson(res, 200, await client.diagnostics())
      return true
    }

    if (req.method === 'GET' && url.pathname === '/api/opencode/skills') {
      const directory = url.searchParams.get('directory') || undefined
      const workspaceID = url.searchParams.get('workspaceID') || undefined
      const data = await client.listSkills({ directory, workspaceID })
      sendJson(res, 200, { data: Array.isArray(data) ? data : [] })
      return true
    }

    if (req.method === 'POST' && url.pathname === '/api/opencode/skills/install') {
      const installed = await installSkillPackage(client, req, url)
      sendJson(res, 201, { data: installed })
      return true
    }

    if (req.method === 'GET' && url.pathname === '/api/opencode/projects') {
      const data = await client.listProjects()
      sendJson(res, 200, { data: Array.isArray(data) ? data : [] })
      return true
    }

    if (url.pathname === '/api/opencode/workspaces') {
      if (req.method === 'GET') {
        const projectID = url.searchParams.get('projectID') || undefined
        const data = await client.listWorkspaces({ projectID })
        sendJson(res, 200, { data: Array.isArray(data) ? data : [] })
        return true
      }
      if (req.method === 'POST') {
        const body = await readJsonBody(req)
        if (!body.type || typeof body.type !== 'string') throw new HttpError(400, 'Workspace type is required')
        const data = await client.createWorkspace(body)
        sendJson(res, 201, { data })
        return true
      }
    }

    const workspaceMatch = url.pathname.match(/^\/api\/opencode\/workspaces\/([^/]+)$/)
    if (workspaceMatch) {
      const workspaceID = decodeURIComponent(workspaceMatch[1])
      if (req.method === 'GET') {
        sendJson(res, 200, { data: await client.getWorkspace(workspaceID) })
        return true
      }
      if (req.method === 'PATCH') {
        sendJson(res, 200, { data: await client.updateWorkspace(workspaceID, await readJsonBody(req)) })
        return true
      }
      if (req.method === 'DELETE') {
        await client.deleteWorkspace(workspaceID)
        sendJson(res, 200, { ok: true })
        return true
      }
    }

    sendJson(res, 404, { error: 'Not found' })
    return true
  } catch (error) {
    sendJson(res, error?.status ?? 500, { error: error?.message ?? String(error) })
    return true
  }
}
