import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { FileStorage } from '../src/file-storage.mjs'
import { createServer } from '../src/server-entry.mjs'

test('uploaded markdown files are available through the same-origin preview route', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dataagent-preview-'))
  const client = { diagnostics: async () => ({ connected: true }) }
  const server = createServer({ client, fileStorage: new FileStorage(directory) })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    await new Promise(resolve => server.close(resolve))
    await rm(directory, { recursive: true, force: true })
  })

  const address = server.address()
  const base = `http://127.0.0.1:${address.port}`
  const form = new FormData()
  form.append('file', new Blob(['# Preview\n\nMarkdown body.'], { type: 'text/markdown' }), 'brief.md')
  form.append('threadId', 'session-preview')

  const uploaded = await fetch(`${base}/dataagent/web/api/agui/file/upload`, { method: 'POST', body: form })
  assert.equal(uploaded.status, 201)
  const body = await uploaded.json()
  assert.equal(body.data.filename, 'brief.md')
  assert.equal(body.data.mimeType, 'text/markdown')
  assert.match(body.data.fileId, /\.bin$/)
  assert.match(body.data.url, /^\/dataagent\/web\/api\/agui\/file\/[0-9a-f-]{36}$/)

  const preview = await fetch(`${base}${body.data.url}`)
  assert.equal(preview.status, 200)
  assert.equal(preview.headers.get('content-type'), 'text/markdown')
  assert.equal(preview.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(await preview.text(), '# Preview\n\nMarkdown body.')

  const missing = await fetch(`${base}/dataagent/web/api/agui/file/00000000-0000-0000-0000-000000000000`)
  assert.equal(missing.status, 404)
})
