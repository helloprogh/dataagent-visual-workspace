import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { normalizeRenderA2uiArgs, RENDER_A2UI_TOOL } from '../../shared/a2ui.mjs'

const protocolError = (res, status, message) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message }, id: null }))
}

export const createA2uiMcpHandler = () => async (req, res, body) => {
  if (req.method !== 'POST') return protocolError(res, 405, 'Method not allowed')
  const server = new Server(
    { name: 'dataagent-a2ui', version: '1.0.0' },
    { capabilities: { tools: {} }, instructions: 'Render only declarative, non-blocking A2UI surfaces.' },
  )
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [RENDER_A2UI_TOOL] }))
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const input = normalizeRenderA2uiArgs(request.params.arguments)
    if (!input) return { isError: true, content: [{ type: 'text', text: 'Surface rejected: invalid A2UI component tree or catalog component.' }] }
    return {
      content: [{ type: 'text', text: input.components.length
        ? `UI surface "${input.surfaceId}" rendered (${input.components.length} components).`
        : `UI surface "${input.surfaceId}" closed.` }],
      structuredContent: { status: input.components.length ? 'rendered' : 'closed', surfaceId: input.surfaceId },
    }
  })
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  try {
    await server.connect(transport)
    await transport.handleRequest(req, res, body)
  } catch (error) {
    if (!res.headersSent) protocolError(res, 500, error.message)
  } finally {
    await transport.close().catch(() => undefined)
    await server.close().catch(() => undefined)
  }
}
