export type ModelSelection = {
  providerID: string
  id: string
}

export type ModelCatalogItem = ModelSelection & {
  name: string
  enabled?: boolean
  capabilities?: {
    tools?: boolean
    input?: string[]
  }
}
