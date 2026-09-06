import { h, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { z } from 'zod'
import { createVueComponent } from './createVueComponent'
import { A2UI_ARTIFACTS } from './artifactContext'
import GeneratedArtifactCard from '../features/conversation/components/GeneratedArtifactCard.vue'

export const ArtifactCard = createVueComponent({
  name: 'ArtifactCard', schema: z.object({ artifactId: z.string() }),
} as any, ({ props, state }: any) => {
  const context = state.context
  const file = context?.lookup(String(props.artifactId ?? ''))
  if (!file) return h('p', { role: 'status' }, state.t('a2ui.invalid'))
  const pending = Boolean(file.approvalInterruptId && context.pending(file.approvalInterruptId))
  return h(GeneratedArtifactCard, {
    file: { ...file, approvalResolved: Boolean(file.approvalInterruptId && !pending) }, pending, busy: context.busy(),
    onPreview: () => context.preview(file),
    onConfirm: (id: string) => { if (!context.busy() && context.pending(id)) context.confirm(id) },
    onCancel: (id: string) => { if (!context.busy() && context.pending(id)) context.cancel(id) },
  })
}, () => ({ context: inject(A2UI_ARTIFACTS, null), t: useI18n().t }))
