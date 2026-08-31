import { reactive } from 'vue'
import type { ArtifactReference } from './types'

type ArtifactPanelMode = 'preview' | 'edit' | 'diff'

const state = reactive({
  open: false,
  artifact: null as ArtifactReference | null,
  mode: 'preview' as ArtifactPanelMode,
})

export const artifactController = {
  state,

  open(artifact: ArtifactReference, mode: ArtifactPanelMode = 'preview') {
    state.artifact = { ...artifact, metadata: artifact.metadata ? { ...artifact.metadata } : undefined }
    state.mode = mode
    state.open = true
  },

  close() {
    state.open = false
  },

  setMode(mode: ArtifactPanelMode) {
    state.mode = mode
  },
}
