import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
import { effectScope } from 'vue'

const source = await fs.readFile(new URL('../../frontend/src/shared/composables/useAsyncResource.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
})
const executable = outputText.replace("from 'vue'", `from '${import.meta.resolve('vue')}'`)
const { useAsyncResource } = await import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}`)

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function fixture(t, resetOnError = false) {
  const requests = []
  const errors = []
  const scope = effectScope()
  const resource = scope.run(() => useAsyncResource({
    initial: () => ['initial'],
    load: () => {
      const request = deferred()
      requests.push(request)
      return request.promise
    },
    onError: error => errors.push(error),
    resetOnError,
  }))
  t.after(() => scope.stop())
  return { ...resource, requests, errors, scope }
}

test('late responses cannot overwrite the latest catalog', async t => {
  const state = fixture(t)
  const first = state.refresh()
  const second = state.refresh()
  state.requests[1].resolve(['new session'])
  await second
  state.requests[0].resolve(['old session'])
  await first
  assert.deepEqual(state.data.value, ['new session'])
  assert.equal(state.loading.value, false)
})

test('stale failures do not notify or finish the active loading state', async t => {
  const state = fixture(t, true)
  const first = state.refresh()
  const second = state.refresh()
  state.requests[0].reject(new Error('stale'))
  await first
  assert.equal(state.loading.value, true)
  assert.deepEqual(state.errors, [])
  state.requests[1].resolve(['latest'])
  await second
  assert.deepEqual(state.data.value, ['latest'])
})

for (const resetOnError of [false, true]) {
  test(`current failures respect resetOnError=${resetOnError}`, async t => {
    const state = fixture(t, resetOnError)
    const first = state.refresh()
    state.requests[0].resolve(['loaded'])
    await first
    const second = state.refresh()
    const error = new Error('unavailable')
    state.requests[1].reject(error)
    await second
    assert.deepEqual(state.data.value, resetOnError ? ['initial'] : ['loaded'])
    assert.deepEqual(state.errors, [error])
    assert.equal(state.loading.value, false)
  })
}

test('disposed pages ignore pending responses and do not start more requests', async t => {
  const state = fixture(t)
  const pending = state.refresh()
  state.scope.stop()
  state.requests[0].resolve(['late'])
  await pending
  await state.refresh()
  assert.deepEqual(state.data.value, ['initial'])
  assert.equal(state.requests.length, 1)
  assert.deepEqual(state.errors, [])
})
