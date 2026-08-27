import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'

const read = async (path) => fs.readFile(new URL(path, import.meta.url), 'utf8')

const publicRequestSources = async () => Promise.all([
  read('../../frontend/src/config/api.ts'),
  read('../../frontend/src/copilot/agent.ts'),
  read('../../frontend/src/components/conversation/ConversationChat.vue'),
  read('../../frontend/vite.config.ts'),
  read('../src/server-entry.mjs'),
  read('../src/opencode-management.mjs'),
])

test('public request paths do not contain opencode segments', async () => {
  for (const source of await publicRequestSources()) {
    assert.doesNotMatch(source, /['"`]\/(?:[^'"`]*\/)?opencode(?:\/|['"`])/)
  }
})

test('frontend request paths are not read from environment variables', async () => {
  const source = (await publicRequestSources()).join('\n')
  for (const variable of [
    'VITE_AGUI_URL',
    'VITE_AGUI_UPLOAD_URL',
    'VITE_DATAAGENT_WEB_API_BASE',
    'VITE_DATAAGENT_API_BASE',
    'VITE_MANAGEMENT_API_BASE',
  ]) {
    assert.doesNotMatch(source, new RegExp(`\\b${variable}\\b`))
  }
})
