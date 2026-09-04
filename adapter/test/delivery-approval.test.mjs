import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function loadApprovalModule() {
  const source = await fs.readFile(new URL('../../frontend/src/features/conversation/approval.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}

test('delivery quick confirmation resolves the first choice of one simple field', async () => {
  const { buildConfirmationResumeEntry } = await loadApprovalModule()
  const entry = buildConfirmationResumeEntry({
    id: 'frm_spec',
    metadata: { kind: 'form' },
    responseSchema: {
      type: 'object',
      properties: {
        decision: { type: 'string', enum: ['确认并继续', '需要修改'] },
      },
      required: ['decision'],
    },
  })
  assert.deepEqual(entry, {
    interruptId: 'frm_spec',
    status: 'resolved',
    payload: { decision: '确认并继续' },
  })
})

test('delivery quick confirmation rejects complex or free-text approvals', async () => {
  const { buildConfirmationResumeEntry } = await loadApprovalModule()
  assert.equal(buildConfirmationResumeEntry({ id: 'complex', responseSchema: {
    type: 'object', properties: { decision: { enum: ['yes'] }, comment: { type: 'string' } },
  }, metadata: { kind: 'form' } }), null)
  assert.equal(buildConfirmationResumeEntry({ id: 'free-text', responseSchema: { type: 'string' }, metadata: { kind: 'form' } }), null)
  assert.equal(buildConfirmationResumeEntry({ id: 'permission', responseSchema: { type: 'string', enum: ['once'] }, metadata: { kind: 'permission' } }), null)
})
