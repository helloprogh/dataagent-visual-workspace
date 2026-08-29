const asRecord = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}

const firstArray = (value, keys = []) => {
  if (Array.isArray(value)) return value
  const record = asRecord(value)
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key]
  }
  return []
}

const toolIdsFrom = (value) => firstArray(value, ['ids', 'tools', 'data'])
  .map((item) => typeof item === 'string' ? item : item?.id ?? item?.name)
  .filter((item) => typeof item === 'string' && item.trim())
  .map((item) => item.trim())

const toolEntriesFrom = (value) => firstArray(value, ['tools', 'items', 'data'])
  .map((item) => {
    if (typeof item === 'string') return { id: item, name: item }
    if (!item || typeof item !== 'object') return null
    const id = item.id ?? item.name
    if (typeof id !== 'string' || !id.trim()) return null
    return {
      id: id.trim(),
      name: String(item.name ?? item.title ?? id),
      description: typeof item.description === 'string' ? item.description : '',
      inputSchema: item.inputSchema ?? item.parameters ?? item.schema,
      origin: item.origin ?? item.source,
    }
  })
  .filter(Boolean)

const mcpEntriesFrom = (value) => Object.entries(asRecord(value)).map(([name, raw]) => {
  const status = asRecord(raw)
  const state = String(status.status ?? 'unknown')
  const labels = {
    connected: '已连接',
    disabled: '已禁用',
    failed: '连接失败',
    needs_auth: '需要授权',
    needs_client_registration: '需要注册',
  }
  return {
    id: `mcp:${name}`,
    name,
    description: typeof status.error === 'string' && status.error
      ? status.error
      : 'MCP 服务运行状态。OpenCode 当前不提供权威的逐 MCP 工具有效清单，因此这里不把连接状态等同于工具可调用性。',
    category: 'MCP',
    kind: 'mcp-server',
    status: state === 'connected' ? 'ready' : state === 'failed' ? 'error' : state === 'disabled' ? 'disabled' : 'attention',
    statusLabel: labels[state] ?? state,
    source: 'OpenCode MCP',
    capabilities: [state],
  }
})

const schemaTags = (schema) => {
  const record = asRecord(schema)
  const properties = asRecord(record.properties)
  const names = Object.keys(properties).slice(0, 4)
  if (names.length) return names
  return record.type ? [String(record.type)] : []
}

export function normalizeCapabilityCatalog({ toolIds, tools, mcp }) {
  const detailed = toolEntriesFrom(tools)
  const detailedById = new Map(detailed.map((item) => [item.id, item]))
  const ids = [...new Set([...toolIdsFrom(toolIds), ...detailed.map((item) => item.id)])]
  const toolItems = ids.map((id) => {
    const item = detailedById.get(id) ?? { id, name: id, description: '', inputSchema: undefined }
    return {
      id,
      name: item.name || id,
      description: item.description || 'OpenCode 运行时已注册该工具。实际执行仍受当前模型、Agent 与权限规则约束。',
      category: 'OpenCode',
      kind: 'tool',
      status: 'registered',
      statusLabel: '已注册',
      source: item.origin ? String(item.origin) : 'OpenCode runtime',
      capabilities: schemaTags(item.inputSchema),
    }
  })
  return [...toolItems, ...mcpEntriesFrom(mcp)]
}

export async function buildCapabilityCatalog(client, { providerID, modelID } = {}) {
  const warnings = []
  const safe = async (label, action, fallback) => {
    try {
      return await action()
    } catch (error) {
      warnings.push(`${label}: ${error instanceof Error ? error.message : String(error)}`)
      return fallback
    }
  }

  const [toolIds, mcp, tools] = await Promise.all([
    safe('tool ids', () => client.listToolIds(), []),
    safe('mcp status', () => client.listMcp(), {}),
    providerID && modelID
      ? safe('tool schemas', () => client.listTools({ providerID, modelID }), [])
      : Promise.resolve([]),
  ])
  const items = normalizeCapabilityCatalog({ toolIds, tools, mcp })
  return {
    items,
    warnings,
    model: providerID && modelID ? { providerID, id: modelID } : null,
    summary: {
      tools: items.filter((item) => item.kind === 'tool').length,
      mcpServers: items.filter((item) => item.kind === 'mcp-server').length,
      connectedMcpServers: items.filter((item) => item.kind === 'mcp-server' && item.status === 'ready').length,
    },
  }
}
