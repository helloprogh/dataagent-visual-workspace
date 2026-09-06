import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import ts from 'typescript'
import { effectScope, ref } from 'vue'

const require = createRequire(import.meta.url)
async function moduleUrl(path, imports = {}) {
  const source = await fs.readFile(new URL(`../../frontend/src/features/conversation/${path}.ts`, import.meta.url), 'utf8')
  let { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } })
  for (const [name, url] of Object.entries({ vue: pathToFileURL(require.resolve('vue')).href, ...imports })) {
    outputText = outputText.replaceAll(`from '${name}'`, `from '${url}'`)
  }
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
}
const { useConversationPanels } = await import(await moduleUrl('composables/useConversationPanels'))
const { useConversationPresentation } = await import(await moduleUrl('composables/useConversationPresentation', {
  '../processPresentation': await moduleUrl('processPresentation'),
}))
const file = (id = 'file') => ({ id, name: `${id}.txt`, url: `/${id}`, mimeType: 'text/plain', approvalInterruptId: 'approval' })

test('panel transitions preserve delivery return path and exclude audit', () => {
  const scope = effectScope()
  const panel = scope.run(useConversationPanels)
  panel.toggleDeliverables()
  panel.openDeliverable(file())
  panel.closeFilePreview()
  assert.equal(panel.deliverablesOpen.value, true)
  panel.toggleAudit()
  assert.equal(panel.deliverablesOpen.value, false)
  assert.equal(panel.auditOpen.value, true)
  panel.openFilePreview(file())
  assert.equal(panel.auditOpen.value, false)
  panel.closeFilePreview()
  assert.equal(panel.deliverablesOpen.value, false)
  panel.toggleAudit()
  panel.closePanels()
  assert.equal(panel.auditOpen.value, false)
  scope.stop()
})

test('late preview approval cannot mark reopened file, another file or disposed panel', async () => {
  for (const transition of [p => p.openFilePreview(file('other')), p => p.openFilePreview(file()), p => p.closePanels(), (_p, scope) => scope.stop()]) {
    const scope = effectScope()
    const panel = scope.run(useConversationPanels)
    panel.openFilePreview(file())
    let release
    const pending = panel.resumePreviewApproval([], () => new Promise(resolve => { release = resolve }))
    transition(panel, scope)
    release(true)
    await pending
    assert.equal(panel.previewApprovalSubmitted.value, false)
    scope.stop()
  }
})

test('only accepted approval for the still selected interrupt is shown as submitted', async () => {
  const scope = effectScope()
  const panel = scope.run(useConversationPanels)
  panel.openFilePreview(file())
  await panel.resumePreviewApproval([], async () => false)
  assert.equal(panel.previewApprovalSubmitted.value, false)
  await panel.resumePreviewApproval([], async () => true)
  assert.equal(panel.previewApprovalSubmitted.value, true)
  panel.openFilePreview(file())
  await panel.resumePreviewApproval([], async () => {
    panel.activePreview.value = { ...file(), approvalInterruptId: 'new-approval' }
    return true
  })
  assert.equal(panel.previewApprovalSubmitted.value, false)
  scope.stop()
})

function viewState() {
  return { messages: ref([]), running: ref(false), activeReasoningId: ref(''), activeTextId: ref(''), responsePhase: ref('waiting'),
    pendingInterrupts: ref([]), deliverables: ref([]), activePreview: ref(null) }
}
test('approval projections retain all concurrent decisions and follow preview changes', () => {
  const state = viewState()
  const view = useConversationPresentation(state)
  state.pendingInterrupts.value = [{ id: 'approval' }]
  state.deliverables.value = [file()]
  assert.equal(view.composerInterrupts.value.length, 0)
  assert.equal(view.pendingDelivery.value.id, 'file')
  state.activePreview.value = file()
  assert.deepEqual(view.previewInterrupts.value.map(item => item.id), ['approval'])
  state.pendingInterrupts.value.push({ id: 'second' })
  assert.equal(view.composerInterrupts.value.length, 2)
  state.deliverables.value = []
  state.pendingInterrupts.value = [{ id: 'second' }]
  assert.equal(view.previewInterrupts.value.length, 0)
  assert.equal(view.composerInterrupts.value.length, 1)
  assert.equal(view.pendingDelivery.value, undefined)
})

test('response placeholder and generated files derive from current snapshot', () => {
  const state = viewState()
  const view = useConversationPresentation(state)
  assert.equal(view.showResponsePending.value, false)
  state.running.value = true
  assert.equal(view.showResponsePending.value, true)
  state.responsePhase.value = 'thinking'
  assert.equal(view.showResponsePending.value, false)
  state.responsePhase.value = 'responding'
  state.activeTextId.value = 'answer'
  assert.equal(view.showResponsePending.value, true)
  state.messages.value = [{ id: 'answer', role: 'assistant', content: 'Hello' }]
  assert.equal(view.showResponsePending.value, false)
  assert.equal(view.presentationItems.value[0].message.id, 'answer')
  state.deliverables.value = [{ ...file(), sourceMessageId: 'tool' }, file('unrelated')]
  assert.deepEqual(view.generatedFilesForProcess([{ kind: 'message', key: 'tool', message: { id: 'tool' } }]).map(item => item.id), ['file'])
})
