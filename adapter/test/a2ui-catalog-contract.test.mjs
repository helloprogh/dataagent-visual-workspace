import assert from 'node:assert/strict'
import test from 'node:test'
import { A2UI_VERSION, A2UI_CATALOG_ID, A2UI_COMPONENT_NAMES, assertA2uiCatalogComponents } from '../../shared/a2ui-catalog.mjs'
import { A2UI_ALLOWED_COMPONENTS, normalizeRenderA2uiArgs } from '../../shared/a2ui.mjs'

test('server catalog uses the shared immutable component contract', () => {
  assert.equal(A2UI_VERSION, 'v0.9')
  assert.equal(new Set(A2UI_COMPONENT_NAMES).size, A2UI_COMPONENT_NAMES.length)
  assert.ok(Object.isFrozen(A2UI_COMPONENT_NAMES))
  assert.deepEqual([...A2UI_ALLOWED_COMPONENTS], [...A2UI_COMPONENT_NAMES])
  assert.doesNotThrow(() => assertA2uiCatalogComponents(A2UI_ALLOWED_COMPONENTS))
  for (const component of A2UI_COMPONENT_NAMES) {
    const result = normalizeRenderA2uiArgs({ surfaceId: 'contract', components: [{ id: 'root', component, ...(component === 'ArtifactCard' ? { artifactId: 'file' } : {}) }],
      ...(component === 'ArtifactCard' ? { artifacts: [{ id: 'file', name: 'a.txt', mimeType: 'text/plain', url: '/dataagent/web/api/agui/workspace-file?path=a.txt' }] } : {}),
    })
    assert.ok(result, `${component} should pass component-name validation`)
  }
  assert.equal(normalizeRenderA2uiArgs({ surfaceId: 'contract', components: [{ id: 'root', component: 'UnregisteredCard' }] }), null)
  assert.ok(A2UI_CATALOG_ID.startsWith('https://'))
})

test('registration guard rejects missing or unadvertised renderers', () => {
  assert.throws(() => assertA2uiCatalogComponents(A2UI_COMPONENT_NAMES.filter(name => name !== 'Markdown')), /missing \[Markdown\]/)
  assert.throws(() => assertA2uiCatalogComponents([...A2UI_COMPONENT_NAMES, 'UnregisteredCard']), /unexpected \[UnregisteredCard\]/)
})
