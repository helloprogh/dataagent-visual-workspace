import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'

const read = async (path) => fs.readFile(new URL(path, import.meta.url), 'utf8')

const frontendRequestSources = async () => Promise.all([
  read('../../frontend/src/shared/config/api.ts'),
  read('../../frontend/src/agui/client.ts'),
  read('../../frontend/src/features/conversation/api/history.ts'),
  read('../../frontend/src/features/conversation/api/session.ts'),
  read('../../frontend/src/features/model/api/model.ts'),
  read('../../frontend/src/features/skill/api/skill.ts'),
  read('../../frontend/src/features/tool/api/tool.ts'),
  read('../../frontend/vite.config.ts'),
])

const publicRequestSources = async () => [
  ...await frontendRequestSources(),
  await read('../src/server-entry.mjs'),
  await read('../src/opencode-management.mjs'),
]

test('public dataagent request paths always use the web prefix', async () => {
  for (const source of await publicRequestSources()) {
    assert.doesNotMatch(source, /['"`]\/dataagent\/(?!web(?:\/|['"`]))/)
    assert.doesNotMatch(source, /['"`]\/(?:[^'"`]*\/)?opencode(?:\/|['"`])/)
  }
})

test('frontend request paths do not use bare api routes', async () => {
  for (const source of await frontendRequestSources()) {
    assert.doesNotMatch(source, /['"`]\/api(?:\/|['"`])/)
  }
})

test('frontend public request paths are centralized instead of configured by URL env vars', async () => {
  const source = (await frontendRequestSources()).join('\n')
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

test('all frontend API bases are hardcoded under dataagent web', async () => {
  const api = await read('../../frontend/src/shared/config/api.ts')
  assert.match(api, /DATAAGENT_WEB_API_BASE = ['"]\/dataagent\/web\/api['"]/) 
  assert.match(api, /AGUI_URL = `\$\{DATAAGENT_WEB_API_BASE\}\/agui`/)
  assert.match(api, /AGUI_UPLOAD_URL = `\$\{AGUI_URL\}\/file\/upload`/)
})
