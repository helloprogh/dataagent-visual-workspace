import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const protocolError = (res, status, message) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message }, id: null }))
}

export const createFrontendMcpHandler = (bridge) => async (req, res, body) => {
  if (req.method !== 'POST') return protocolError(res, 405, 'Method not allowed')
  const server = new Server(
    { name: 'dataagent-agui-frontend', version: '1.0.0' },
    {
      capabilities: { tools: {} },
      instructions: 'These tools update the connected Data Agent visual workspace. Use them when a visual answer helps the user.',
    },
  )
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: bridge.tools() }))
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await bridge.invokeAny(request.params.name)
    return {
      isError: Boolean(result.error),
      content: [{ type: 'text', text: result.error ? `Error: ${result.error}` : (result.text || 'Frontend action completed.') }],
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
