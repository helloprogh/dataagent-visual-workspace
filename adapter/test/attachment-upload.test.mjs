import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await fs.readFile(new URL('../../frontend/src/features/conversation/attachmentUpload.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } })
const { uploadAttachments } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
const items = () => Array.from({ length: 5 }, (_, id) => ({ id, status: 'queued' }))

test('upload pool bounds concurrency, preserves order and only retries failed files', async () => {
  const batch = items()
  const calls = []
  let active = 0
  let max = 0
  const upload = async item => {
    calls.push(item.id)
    max = Math.max(max, ++active)
    await new Promise(resolve => setTimeout(resolve, 5))
    active--
    if (item.id === 1 && calls.filter(id => id === 1).length === 1) throw new Error('offline')
    return `file-${item.id}`
  }
  const signal = new AbortController().signal
  await assert.rejects(uploadAttachments(batch, 'a', upload, signal), /附件上传失败/)
  assert.equal(max, 3)
  assert.equal(active, 0)
  assert.equal(batch[1].status, 'failed')
  assert.equal(batch[1].error, 'offline')
  assert.deepEqual(await uploadAttachments(batch, 'a', upload, signal), batch.map(item => `file-${item.id}`))
  assert.deepEqual(calls, [0, 1, 2, 3, 4, 1])
  assert.ok(batch.every(item => item.status === 'uploaded'))
  await uploadAttachments(batch, 'b', upload, signal)
  assert.equal(calls.length, 11, 'cache is scoped to its session')
})

test('abort ignores late successes, does not start queued files and settles all workers', async () => {
  const batch = items()
  const controller = new AbortController()
  let finish
  const gate = new Promise(resolve => { finish = resolve })
  let calls = 0
  const pending = uploadAttachments(batch, 'a', async () => { calls++; await gate; return 'late' }, controller.signal)
  controller.abort(new Error('stopped'))
  finish()
  await assert.rejects(pending, /stopped/)
  assert.equal(calls, 3)
  assert.ok(batch.every(item => item.status === 'queued' && !item.uploaded))
})
