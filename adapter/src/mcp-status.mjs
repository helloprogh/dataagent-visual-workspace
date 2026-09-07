export function mcpEntries(value) {
  if (Array.isArray(value)) return value.filter(item => typeof item?.name === 'string').map(item => [item.name, item.status ?? {}])
  return value && typeof value === 'object' ? Object.entries(value) : []
}

export function isMcpConnected(value, name) {
  return mcpEntries(value).some(([key, status]) => key === name && status?.status === 'connected')
}

export async function ensureMcpConnected(client, registrations, name, url) {
  if (registrations.get(name) === url && isMcpConnected(await client.listMcp(), name)) return
  registrations.delete(name)
  await client.disconnectMcp(name).catch(error => {
    if (!/not found|404|unknown/i.test(error.message)) throw error
  })
  await client.addMcp(name, url)
  await client.connectMcp(name).catch(error => {
    if (!/already|connected|409/i.test(error.message)) throw error
  })
  if (!isMcpConnected(await client.listMcp(), name)) {
    throw new Error(`MCP ${name} is not connected. Check service logs and localhost NO_PROXY settings.`)
  }
  registrations.set(name, url)
}
