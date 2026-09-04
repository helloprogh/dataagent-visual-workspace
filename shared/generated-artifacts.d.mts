export type GeneratedArtifact = {
  id: string
  sourcePath: string
  name: string
  mimeType: string
  archive: boolean
}

export function generatedArtifactMimeType(filename: string): string
export function artifactPathKey(value: unknown): string
export function generatedArtifactsFromTool(
  call: unknown,
  successfulToolIds: Set<string>,
): GeneratedArtifact[]
export function removedArtifactPathsFromTool(
  call: unknown,
  successfulToolIds: Set<string>,
): string[]
