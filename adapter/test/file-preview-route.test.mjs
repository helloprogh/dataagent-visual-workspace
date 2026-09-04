import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { deflateRawSync } from 'node:zlib'
import { FileStorage } from '../src/file-storage.mjs'
import { createServer } from '../src/server-entry.mjs'

function storedZip(files) {
  const locals = []
  const central = []
  let offset = 0
  for (const [name, value, method = 0] of files) {
    const filename = Buffer.from(name)
    const body = Buffer.from(value)
    const compressed = method === 8 ? deflateRawSync(body) : body
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(body.length, 22)
    local.writeUInt16LE(filename.length, 26)
    locals.push(local, filename, compressed)

    const directory = Buffer.alloc(46)
    directory.writeUInt32LE(0x02014b50, 0)
    directory.writeUInt16LE(20, 4)
    directory.writeUInt16LE(20, 6)
    directory.writeUInt16LE(0, 8)
    directory.writeUInt16LE(method, 10)
    directory.writeUInt32LE(compressed.length, 20)
    directory.writeUInt32LE(body.length, 24)
    directory.writeUInt16LE(filename.length, 28)
    directory.writeUInt32LE(offset, 42)
    central.push(directory, filename)
    offset += local.length + filename.length + compressed.length
  }
  const centralBytes = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralBytes.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, centralBytes, end])
}

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

test('generated workspace files are previewed without allowing path traversal', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dataagent-workspace-preview-'))
  const outside = path.join(os.tmpdir(), `dataagent-outside-${Date.now()}.md`)
  await writeFile(path.join(directory, 'spec.md'), '# Generated spec')
  await writeFile(outside, '# Private')
  const client = { workspaceDirectory: directory, diagnostics: async () => ({ connected: true }) }
  const server = createServer({ client, fileStorage: new FileStorage(directory) })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    await new Promise(resolve => server.close(resolve))
    await rm(directory, { recursive: true, force: true })
    await rm(outside, { force: true })
  })

  const address = server.address()
  const base = `http://127.0.0.1:${address.port}/dataagent/web/api/agui/workspace-file`
  const preview = await fetch(`${base}?path=${encodeURIComponent('spec.md')}`)
  assert.equal(preview.status, 200)
  assert.equal(preview.headers.get('content-type'), 'text/markdown; charset=utf-8')
  assert.equal(await preview.text(), '# Generated spec')

  const escaped = await fetch(`${base}?path=${encodeURIComponent(outside)}`)
  assert.equal(escaped.status, 404)
})

test('structured workspace archives expose a safe tree and readable entries', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dataagent-workspace-archive-'))
  await writeFile(path.join(directory, 'implementation.zip'), storedZip([
    ['spec/README.md', '# Spec'],
    ['spec/acceptance.json', '{"status":"ready"}', 8],
    ['src/main.sql', 'select 1;'],
  ]))
  const client = { workspaceDirectory: directory, diagnostics: async () => ({ connected: true }) }
  const server = createServer({ client, fileStorage: new FileStorage(directory) })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    await new Promise(resolve => server.close(resolve))
    await rm(directory, { recursive: true, force: true })
  })

  const address = server.address()
  const base = `http://127.0.0.1:${address.port}/dataagent/web/api/agui/workspace-archive?path=${encodeURIComponent('implementation.zip')}`
  const manifest = await fetch(base)
  assert.equal(manifest.status, 200)
  const entries = (await manifest.json()).data.entries
  assert.deepEqual(entries.map(entry => entry.path), ['spec/acceptance.json', 'spec/README.md', 'src/main.sql'])

  const entry = await fetch(`${base}&entry=${encodeURIComponent('spec/README.md')}`)
  assert.equal(entry.status, 200)
  assert.equal(entry.headers.get('content-type'), 'text/markdown; charset=utf-8')
  assert.equal(await entry.text(), '# Spec')

  const escaped = await fetch(`${base}&entry=${encodeURIComponent('../secret.txt')}`)
  assert.equal(escaped.status, 404)
})
