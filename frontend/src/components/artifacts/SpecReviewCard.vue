<script setup lang="ts">
import { computed } from 'vue'
import { ElMessageBox } from 'element-plus'
import type { Interrupt, ToolCall } from '@ag-ui/client'
import { artifactController } from '../../artifacts/store'
import type { ArtifactReference } from '../../artifacts/types'

const props = defineProps<{
  interrupt: Interrupt
  toolCall: ToolCall
  resolving?: boolean
  resolve: (payload: unknown, interruptId: string) => Promise<unknown>
}>()

type ReviewSpecArgs = {
  documentId: string
  version: string
  title: string
  summary?: string
}

function parseArgs(): ReviewSpecArgs | null {
  try {
    const value = JSON.parse(props.toolCall.function.arguments || '{}') as Partial<ReviewSpecArgs>
    if (!value.documentId || !value.version || !value.title) return null
    return value as ReviewSpecArgs
  } catch {
    return null
  }
}

const args = computed(parseArgs)
const artifact = computed<ArtifactReference | null>(() => {
  const value = args.value
  if (!value) return null
  return {
    artifactId: value.documentId,
    artifactType: 'spec',
    title: value.title,
    version: value.version,
    summary: value.summary,
    status: 'reviewing',
  }
})

const currentVersion = computed(() => {
  const value = args.value
  if (!value) return ''
  const opened = artifactController.state.artifact
  return opened?.artifactType === 'spec' && opened.artifactId === value.documentId
    ? (opened.version ?? value.version)
    : value.version
})

function openSpec() {
  if (artifact.value) artifactController.open({ ...artifact.value, version: currentVersion.value })
}

async function approve() {
  const value = args.value
  if (!value) return
  await props.resolve({
    decision: 'approved',
    documentId: value.documentId,
    version: currentVersion.value,
  }, props.interrupt.id)
}

async function requestChanges() {
  const value = args.value
  if (!value) return
  try {
    const { value: comment } = await ElMessageBox.prompt('描述希望 Agent 修改的内容', '要求修改', {
      confirmButtonText: '提交修改意见',
      cancelButtonText: '取消',
      inputType: 'textarea',
      inputPattern: /\S+/,
      inputErrorMessage: '修改意见不能为空',
    })
    await props.resolve({
      decision: 'changes-requested',
      documentId: value.documentId,
      version: currentVersion.value,
      comment,
    }, props.interrupt.id)
  } catch {
    // cancelled
  }
}
</script>

<template>
  <section v-if="args && artifact" class="spec-review-card">
    <button class="spec-review-card__main" type="button" @click="openSpec">
      <span class="spec-review-card__icon" aria-hidden="true">S</span>
      <span class="spec-review-card__copy">
        <span class="spec-review-card__meta"><b>SPEC</b><span>{{ currentVersion }}</span><em>待确认</em></span>
        <strong>{{ args.title }}</strong>
        <small v-if="args.summary">{{ args.summary }}</small>
      </span>
      <span class="spec-review-card__open">打开</span>
    </button>
    <footer class="spec-review-card__actions">
      <span>可打开预览并直接编辑 Markdown；保存修改不会自动确认。</span>
      <div>
        <el-button size="small" :disabled="resolving" @click="requestChanges">要求 Agent 修改</el-button>
        <el-button size="small" type="primary" :loading="resolving" @click="approve">确认并继续</el-button>
      </div>
    </footer>
  </section>

  <el-alert v-else title="Spec Review 参数无效" type="error" :closable="false" show-icon />
</template>

<style scoped>
.spec-review-card{width:min(100%,660px);overflow:hidden;border:1px solid var(--da-border);border-radius:12px;background:var(--da-surface-1)}
.spec-review-card__main{width:100%;display:grid;grid-template-columns:40px minmax(0,1fr) auto;align-items:center;gap:12px;padding:14px;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer}
.spec-review-card__main:hover{background:var(--da-surface-2)}
.spec-review-card__main:focus-visible{outline:2px solid var(--da-border-focus);outline-offset:-2px}
.spec-review-card__icon{width:40px;height:40px;display:grid;place-items:center;border:1px solid var(--da-border);border-radius:10px;background:var(--da-surface-deep);color:var(--da-text-emphasis);font-size:12px;font-weight:700}
.spec-review-card__copy{min-width:0;display:flex;flex-direction:column;gap:4px}
.spec-review-card__meta{display:flex;align-items:center;gap:8px;color:var(--da-text-subtle);font-size:11px}
.spec-review-card__meta b{color:var(--da-text-secondary)}
.spec-review-card__meta em{padding:2px 6px;border-radius:999px;background:color-mix(in srgb,var(--da-accent-orange) 10%,transparent);color:var(--da-accent-orange);font-style:normal}
.spec-review-card__copy strong{overflow:hidden;color:var(--da-text-primary);font-size:14px;font-weight:640;text-overflow:ellipsis;white-space:nowrap}
.spec-review-card__copy small{overflow:hidden;color:var(--da-text-muted);font-size:12px;text-overflow:ellipsis;white-space:nowrap}
.spec-review-card__open{color:var(--da-text-subtle);font-size:12px}
.spec-review-card__actions{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border-top:1px solid var(--da-border);background:color-mix(in srgb,var(--da-surface-2) 42%,transparent)}
.spec-review-card__actions>span{color:var(--da-text-subtle);font-size:11px;line-height:1.5}
.spec-review-card__actions>div{display:flex;flex:none;gap:8px}
@media(max-width:720px){.spec-review-card__actions{align-items:flex-start;flex-direction:column}.spec-review-card__actions>div{width:100%;justify-content:flex-end}}
</style>
