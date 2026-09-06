export type A2uiArtifact = { id: string; name: string; url: string; mimeType: string; category: 'output' }
export function normalizeA2uiArtifacts(value: unknown): A2uiArtifact[] | null
