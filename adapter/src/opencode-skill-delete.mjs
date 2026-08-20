import { homedir } from 'node:os'
import { lstat, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { applyCors } from './sse.mjs'

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

const workspaceDirectory = (workspace) => workspace?.directory ?? workspace?.path ?? workspace?.worktree

const pathKey = (value) => {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

const globalSkillRoot = () => {
  const configRoot = process.env.XDG_CONFIG_HOME || path.join(homedir(), '.config')
  return path.resolve(configRoot, 'opencode', 'skills')
}

const skillDirectoryFromLocation = (location) => {
  if (!location || typeof location !== 'string') throw new HttpError(400, 'Skill location is required')
  if (!path.isAbsolute(location)) throw new HttpError(409, 'OpenCode2 returned a non-absolute Skill location')
  const resolved = path.resolve(location)
  return path.basename(resolved).toLowerCase() === 'skill.md' ? path.dirname(resolved) : resolved
}

const sameSkill = (skill, skillId, location) => {
  const id = String(skill?.id ?? skill?.name ?? '')
  const candidateLocation = String(skill?.location ?? '')
  if (id !== skillId || !candidateLocation) return false
  try {
    return pathKey(skillDirectoryFromLocation(candidateLocation)) === pathKey(skillDirectoryFromLocation(location))
  } catch {
    return false
  }
}

const assertManagedSkillDirectory = async (target, roots) => {
  const targetParent = pathKey(path.dirname(target))
  const matchedRoot = roots.find((root) => pathKey(root.path) === targetParent)
  if (!matchedRoot) {
    throw new HttpError(403, 'Skill is not inside a Data Agent managed OpenCode2 Skill directory')
  }

  let info
  try {
    info = await lstat(target)
  } catch (error) {
    if (error?.code === 'ENOENT') throw new HttpError(404, 'Skill directory no longer exists')
    throw error
  }
  if (info.isSymbolicLink()) throw new HttpError(409, 'Symbolic-link Skill directories are not deleted by Data Agent')
  if (!info.isDirectory()) throw new HttpError(409, 'Skill location is not a directory')

  try {
    const manifest = await stat(path.join(target, 'SKILL.md'))
    if (!manifest.isFile()) throw new HttpError(409, 'Skill directory does not contain a valid SKILL.md file')
  } catch (error) {
    if (error instanceof HttpError) throw error
    if (error?.code === 'ENOENT') throw new HttpError(409, 'Skill directory does not contain SKILL.md')
    throw error
  }
  return matchedRoot.scope
}

export const createOpenCodeSkillDeleteHandler = (client) => async (req, res, url) => {
  const match = url.pathname.match(/^\/api\/opencode\/skills\/([^/]+)$/)
  if (req.method !== 'DELETE' || !match) return false

  try {
    const skillId = decodeURIComponent(match[1])
    if (!skillId || skillId.length > 128) throw new HttpError(400, 'Skill id is invalid')
    const location = url.searchParams.get('location')
    if (!location) throw new HttpError(400, 'Skill location is required')
    const workspaceID = url.searchParams.get('workspaceID') || undefined

    const roots = [{ scope: 'global', path: globalSkillRoot() }]
    let context = {}
    if (workspaceID) {
      const workspace = await client.getWorkspace(workspaceID)
      const directory = workspaceDirectory(workspace)
      if (!directory) throw new HttpError(502, 'OpenCode2 workspace did not return a directory')
      roots.push({ scope: 'workspace', path: path.resolve(directory, '.opencode', 'skills') })
      context = { workspaceID, directory }
    }

    const skills = await client.listSkills(context)
    const skill = (Array.isArray(skills) ? skills : []).find((item) => sameSkill(item, skillId, location))
    if (!skill) {
      throw new HttpError(404, 'Skill is not registered in the selected OpenCode2 context')
    }

    const target = skillDirectoryFromLocation(String(skill.location))
    const scope = await assertManagedSkillDirectory(target, roots)
    await rm(target, { recursive: true, force: false })

    sendJson(res, 200, {
      ok: true,
      data: {
        id: skillId,
        scope,
        workspaceID,
        location: target,
      },
    })
    return true
  } catch (error) {
    sendJson(res, error?.status ?? 500, { error: error?.message ?? String(error) })
    return true
  }
}
