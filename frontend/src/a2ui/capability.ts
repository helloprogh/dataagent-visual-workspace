import { A2UI_CATALOG_ID, A2UI_COMPONENT_NAMES } from '../../../shared/a2ui-catalog.mjs'
export const DATA_AGENT_CATALOG_ID = A2UI_CATALOG_ID
export const A2UI_ALLOWED_COMPONENTS = A2UI_COMPONENT_NAMES

export const A2UI_RUN_CAPABILITY = {
  forwardedProps: { a2uiCatalogAvailable: true },
  context: [{
    description: 'A2UI catalog capabilities: available catalog IDs and components the client can render.',
    value: JSON.stringify({ catalogId: DATA_AGENT_CATALOG_ID, components: A2UI_ALLOWED_COMPONENTS }),
  }],
}
