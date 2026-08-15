import assert from 'node:assert/strict'
import test from 'node:test'
import { FrontendToolBridge } from '../src/frontend-tool-bridge.mjs'

const tool = {
  name: 'workspace.render',
  description: 'Render the workspace',
  parameters: { type: 'object', properties: { title: { type: 'string' } } },
}

test('maps prefixed OpenCode MCP names back to AG-UI frontend tools', () => {
  const bridge = new FrontendToolBridge()
  bridge.updateCatalog('thread-1', [tool])
  assert.equal(bridge.resolveName('thread-1', 'agui_abcd_workspace_render'), 'workspace.render')
})

test('waits for the CopilotKit ToolMessage and returns it to OpenCode MCP', async () => {
  const bridge = new FrontendToolBridge({ timeoutMs: 1000 })
  bridge.updateCatalog('thread-1', [tool])
  bridge.registerNativeCall('thread-1', {
    toolCallId: 'call-1',
    nativeName: 'agui_abcd_workspace_render',
    args: { title: 'Current analysis' },
  })

  const invocation = bridge.invoke('thread-1', 'workspace.render')
  assert.deepEqual(bridge.acceptToolMessages('thread-1', [{
    role: 'tool',
    toolCallId: 'call-1',
    content: 'Workspace rendered.',
  }]), ['call-1'])
  assert.deepEqual(await invocation, { text: 'Workspace rendered.', error: undefined })
  assert.equal(bridge.shouldSuppress('thread-1', 'call-1'), true)
  assert.equal(bridge.shouldSuppress('thread-1', 'call-1', true), true)
  assert.equal(bridge.shouldSuppress('thread-1', 'call-1'), false)
})
