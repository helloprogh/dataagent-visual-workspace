import type { InjectionKey } from 'vue'
import type { ConversationFilePreview } from '../features/conversation/types/filePreview'

export type ArtifactContext = {
  lookup: (id: string) => ConversationFilePreview | undefined
  pending: (id: string) => boolean
  busy: () => boolean
  preview: (file: ConversationFilePreview) => void
  confirm: (id: string) => void
  cancel: (id: string) => void
}
export const A2UI_ARTIFACTS: InjectionKey<ArtifactContext> = Symbol('a2ui-artifacts')
