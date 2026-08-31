export type ArtifactType =
  | 'spec'
  | 'report'
  | 'sql'
  | 'dataset'
  | 'chart'
  | 'file'
  | 'file-package'
  | 'markdown'
  | 'log'
  | string

export interface ArtifactReference {
  artifactId: string
  artifactType: ArtifactType
  title: string
  version?: string
  summary?: string
  status?: string
  metadata?: Record<string, unknown>
}

export function isArtifactReference(value: unknown): value is ArtifactReference {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.artifactId === 'string'
    && typeof candidate.artifactType === 'string'
    && typeof candidate.title === 'string'
}
