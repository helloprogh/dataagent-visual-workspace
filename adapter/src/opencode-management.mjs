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

const readJsonBody = async (req) => {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > 1024 * 1024) throw new HttpError(413, 'Request body is too large')
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON')
  }
}

const API_BASE = '/dataagent/web/api'
const isManagementPath = (pathname) => pathname === `${API_BASE}/health`
  || pathname === `${API_BASE}/projects`
  || pathname === `${API_BASE}/workspaces`
  || new RegExp(`^${API_BASE.replace(/\//g, '\\/')}\\/workspaces\\/[^/]+$`).test(pathname)

export const createOpenCodeManagementHandler = (client) => async (req, res, url) => {
  if (!isManagementPath(url.pathname)) return false
  try {
    if (req.method === 'GET' && url.pathname === `${API_BASE}/health`) {
      sendJson(res, 200, await client.diagnostics())
      return true
    }

    if (req.method === 'GET' && url.pathname === `${API_BASE}/projects`) {
      const data = await client.listProjects()
      sendJson(res, 200, { data: Array.isArray(data) ? data : [] })
      return true
    }

    if (url.pathname === `${API_BASE}/workspaces`) {
      if (req.method === 'GET') {
        const projectID = url.searchParams.get('projectID') || undefined
        const data = await client.listWorkspaces({ projectID })
        sendJson(res, 200, { data: Array.isArray(data) ? data : [] })
        return true
      }
      if (req.method === 'POST') {
        const body = await readJsonBody(req)
        if (!body.type || typeof body.type !== 'string') throw new HttpError(400, 'Workspace type is required')
        sendJson(res, 201, { data: await client.createWorkspace(body) })
        return true
      }
    }

    const match = url.pathname.match(new RegExp(`^${API_BASE.replace(/\//g, '\\/')}\\/workspaces\\/([^/]+)$`))
    if (match) {
      const workspaceID = decodeURIComponent(match[1])
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
