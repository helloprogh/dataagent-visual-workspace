import { Catalog } from '@a2ui/web_core/v0_9'
import { BASIC_FUNCTIONS } from '@a2ui/web_core/v0_9/basic_catalog'
import { assertA2uiCatalogComponents } from '../../../shared/a2ui-catalog.mjs'
import { DATA_AGENT_CATALOG_ID } from './capability'
import { dataAgentBasicComponents } from './basicCatalog'
import { dataAgentBusinessComponents } from './businessCatalog'

export { A2UI_ALLOWED_COMPONENTS, DATA_AGENT_CATALOG_ID } from './capability'

// Explicit override order: application Button replaces the basic renderer.
const components = new Map(
  [...dataAgentBasicComponents, ...dataAgentBusinessComponents].map(component => [component.name, component]),
)
assertA2uiCatalogComponents(components.keys())

export const dataAgentCatalog = new Catalog(
  DATA_AGENT_CATALOG_ID,
  [...components.values()],
  BASIC_FUNCTIONS,
)
