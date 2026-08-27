import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'

const read = async (path) => fs.readFile(new URL(path, import.meta.url), 'utf8')

test('public request paths do not contain opencode segments', async () => {
  const files = await Promise.all([
    read('../../frontend/src/config/api.ts'),
    read('../../frontend/src/copilot/agent.ts'),
    read('../../frontend/src/components/conversation/ConversationChat.vue'),
    read('../src/server-entry.mjs'),
    read('../src/opencode-management.mjs'),
  ])

  for (const source of files) {
    assert.doesNotMatch(source, /['"`]\/(?:[^'"`]*\/)?opencode(?:\/|['"`])/)
  }
})
