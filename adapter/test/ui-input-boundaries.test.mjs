import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function load(path) {
  const source = await fs.readFile(new URL(`../../frontend/src/${path}.ts`, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}
const { validateApproval, unsupportedApprovalSchema } = await load('features/conversation/approvalSchema')
const { readBoundedText } = await load('shared/api/readBoundedText')

test('approval validation preserves false and zero, validates constraints and optional fields', () => {
  const schema = { type: 'object', properties: {
    enabled: { type: 'boolean' }, count: { type: 'integer', minimum: 0, maximum: 5 },
    note: { type: 'string', minLength: 2, maxLength: 4, pattern: '^[A-Z]+$' },
  }, required: ['enabled', 'count'] }
  assert.deepEqual(validateApproval(schema, { enabled: false, count: 0 }), [])
  for (const count of [-1, 6, 1.2, '2', null]) assert.ok(validateApproval(schema, { enabled: true, count }).length)
  assert.ok(validateApproval(schema, { enabled: false }).length)
  for (const note of ['A', 'ABCDE', 'ab']) assert.ok(validateApproval(schema, { enabled: true, count: 2, note }).length)
  assert.deepEqual(validateApproval(schema, { enabled: true, count: 2, note: 'OK' }), [])
})

test('date-time requires real dates, complete time and explicit timezone', () => {
  const schema = { type: 'string', format: 'date-time' }
  for (const value of ['2026-09-06', '2026-09-06T12:30:00', '2026-02-30T12:30:00Z', '2026-09-06T24:30:00Z']) {
    assert.ok(validateApproval(schema, value).length, value)
  }
  for (const value of ['2026-09-06T12:30:45+08:00', '2026-09-06T04:30:45.123Z']) assert.deepEqual(validateApproval(schema, value), [])
  assert.deepEqual(validateApproval({ type: 'string', format: 'date' }, '2024-02-29'), [])
  assert.ok(validateApproval({ type: 'string', format: 'date' }, '2026-02-29').length)
})

test('arrays and choices enforce enum, uniqueness and supported oneOf constants', () => {
  const schema = { type: 'array', items: { type: 'string', enum: ['a', 'b'] }, minItems: 1, maxItems: 2, uniqueItems: true }
  assert.deepEqual(validateApproval(schema, ['a', 'b']), [])
  for (const value of [[], ['a', 'a'], ['c'], ['a', 'b', 'a']]) assert.ok(validateApproval(schema, value).length)
  assert.deepEqual(validateApproval({ oneOf: [{ const: 'yes', title: '同意' }, { const: 'no' }] }, 'yes'), [])
  assert.ok(validateApproval({ type: 'number', exclusiveMinimum: 0, multipleOf: 0.1 }, 0).length)
  assert.deepEqual(validateApproval({ type: 'number', multipleOf: 0.1 }, 0.3), [])
})

test('unsupported approval schemas are blocked rather than silently submitted', () => {
  for (const schema of [
    {}, { type: 'object', properties: { nested: { type: 'object', properties: {} } } },
    { type: 'string', pattern: '[' }, { type: 'string', format: 'unknown' },
    { type: 'string', allOf: [] }, { type: 'string', $ref: '#/definitions/name' },
    { oneOf: [{ type: 'string' }, { type: 'number' }] },
    { type: 'object', properties: {}, required: ['missing'] },
  ]) {
    assert.ok(unsupportedApprovalSchema(schema).length)
    assert.equal(validateApproval(schema, {}).at(0).kind, 'unsupported')
  }
})

test('preview stops and cancels an unbounded response without content-length', async () => {
  let reads = 0, cancelled = false
  const response = new Response(new ReadableStream({
    pull(controller) { reads += 1; controller.enqueue(new TextEncoder().encode('0123456789')) },
    cancel() { cancelled = true },
  }, { highWaterMark: 0 }))
  const result = await readBoundedText(response, 16)
  assert.deepEqual(result, { text: '0123456789012345', truncated: true })
  assert.equal(reads, 2)
  assert.equal(cancelled, true)
})

test('preview counts UTF-8 bytes and drops only the incomplete cutoff character', async () => {
  const bytes = new TextEncoder().encode('A中文B')
  const response = new Response(new ReadableStream({
    start(controller) { controller.enqueue(bytes.slice(0, 2)); controller.enqueue(bytes.slice(2)); controller.close() },
  }))
  assert.deepEqual(await readBoundedText(response, 5), { text: 'A中', truncated: true })
  assert.deepEqual(await readBoundedText(new Response('A中'), 4), { text: 'A中', truncated: false })
  assert.deepEqual(await readBoundedText(new Response(null), 4), { text: '', truncated: false })
})

test('preview propagates stream errors rather than returning a successful partial file', async () => {
  const response = new Response(new ReadableStream({ start(controller) { controller.error(new Error('aborted')) } }))
  await assert.rejects(readBoundedText(response, 4), /aborted/)
})
