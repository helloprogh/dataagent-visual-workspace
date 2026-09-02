<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Interrupt, ResumeEntry } from '@ag-ui/client'
import { MarkdownRenderer } from 'x-markdown-vue'
import { appTheme } from '../../../shared/theme/theme'
import { fileKindLabel, formatFileSize, type ConversationFilePreview } from '../types/filePreview'
import InterruptCard from './InterruptCard.vue'

const props = withDefaults(defineProps<{
  file: ConversationFilePreview
  interrupts?: Interrupt[]
  busy?: boolean
  approvalSubmitted?: boolean
}>(), {
  interrupts: () => [],
  busy: false,
  approvalSubmitted: false,
})
const emit = defineEmits<{
  close: []
  resume: [entries: ResumeEntry[]]
}>()

const MAX_TEXT_BYTES = 1024 * 1024
const content = ref('')
const loading = ref(false)
const error = ref('')
const truncated = ref(false)
let controller: AbortController | null = null

const extension = computed(() => props.file.name.split('.').pop()?.toLowerCase() ?? '')
const kind = computed(() => {
  if (props.file.mimeType === 'text/markdown' || ['md', 'markdown', 'mdx'].includes(extension.value)) return 'markdown'
  if (props.file.mimeType.startsWith('image/')) return 'image'
  if (props.file.mimeType === 'application/pdf' || extension.value === 'pdf') return 'pdf'
  if (props.file.mimeType.startsWith('text/') || ['json', 'yaml', 'yml', 'csv', 'sql', 'xml', 'log'].includes(extension.value)) return 'text'
  return 'unsupported'
})

async function loadText() {
  controller?.abort()
  content.value = ''
  error.value = ''
  truncated.value = false
  if (!['markdown', 'text'].includes(kind.value)) return

  const nextController = new AbortController()
  controller = nextController
  loading.value = true
  try {
    const response = await fetch(props.file.url, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: nextController.signal,
    })
    if (!response.ok) throw new Error(`文件读取失败 (${response.status})`)
    const declaredSize = Number(response.headers.get('content-length') ?? 0)
    if (declaredSize > MAX_TEXT_BYTES) throw new Error('文件超过 1 MB，请下载后查看')
    const value = await response.text()
    truncated.value = value.length > MAX_TEXT_BYTES
    content.value = value.slice(0, MAX_TEXT_BYTES)
  } catch (reason) {
    if (nextController.signal.aborted) return
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    if (controller === nextController) loading.value = false
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

watch(() => props.file, loadText, { immediate: true })
window.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => {
  controller?.abort()
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <aside class="file-preview-panel" aria-label="文件预览" data-testid="file-preview-panel">
    <header class="file-preview-panel__header">
      <div class="file-preview-panel__identity">
        <span class="file-preview-panel__mark">{{ fileKindLabel(file).slice(0, 2) }}</span>
        <div>
          <b :title="file.name">{{ file.name }}</b>
          <small>{{ [fileKindLabel(file), formatFileSize(file.size)].filter(Boolean).join(' · ') }}</small>
        </div>
      </div>
      <div class="file-preview-panel__actions">
        <a :href="file.url" target="_blank" rel="noreferrer" aria-label="在新窗口打开">↗</a>
        <button type="button" aria-label="关闭文件预览" @click="emit('close')">×</button>
      </div>
    </header>

    <div class="file-preview-panel__body">
      <section v-if="interrupts.length || approvalSubmitted" class="file-preview-panel__approval">
        <div class="file-preview-panel__approval-heading">
          <div>
            <i aria-hidden="true"></i>
            <span>文件审批</span>
          </div>
          <small>{{ approvalSubmitted ? '已提交' : '等待你的决定' }}</small>
        </div>
        <InterruptCard
          v-if="interrupts.length"
          variant="embedded"
          :interrupts="interrupts"
          :busy="busy"
          @resume="emit('resume', $event)"
        />
        <p v-else>审批结果已发送，文件仍可继续预览。</p>
      </section>

      <el-skeleton v-if="loading" :rows="12" animated />

      <div v-else-if="error" class="file-preview-panel__state">
        <strong>暂时无法预览</strong>
        <p>{{ error }}</p>
        <a :href="file.url" target="_blank" rel="noreferrer">打开原文件</a>
      </div>

      <img v-else-if="kind === 'image'" :src="file.url" :alt="file.name" />

      <iframe
        v-else-if="kind === 'pdf'"
        :src="file.url"
        :title="`${file.name} 预览`"
      ></iframe>

      <div v-else-if="kind === 'markdown'" class="file-preview-panel__markdown">
        <MarkdownRenderer
          :markdown="content"
          :sanitize="true"
          :is-dark="appTheme === 'dark'"
          :enable-shiki="false"
          :enable-mermaid="false"
        />
        <p v-if="truncated" class="file-preview-panel__notice">内容较长，仅显示前 1 MB。</p>
      </div>

      <div v-else-if="kind === 'text'" class="file-preview-panel__text">
        <pre>{{ content }}</pre>
        <p v-if="truncated" class="file-preview-panel__notice">内容较长，仅显示前 1 MB。</p>
      </div>

      <div v-else class="file-preview-panel__state">
        <strong>此格式暂不支持内嵌预览</strong>
        <p>可以在新窗口打开或下载后查看。</p>
        <a :href="file.url" target="_blank" rel="noreferrer">打开原文件</a>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.file-preview-panel { display: grid; grid-template-rows: auto minmax(0, 1fr); min-width: 0; min-height: 0; border-left: 0.0625rem solid var(--da-border-strong); background: var(--da-surface-1); box-shadow: -1.5rem 0 4rem rgb(0 0 0 / 18%); }
.file-preview-panel__header { display: flex; min-height: 3.75rem; align-items: center; justify-content: space-between; gap: var(--da-space-4); padding: 0 var(--da-space-4); border-bottom: 0.0625rem solid var(--da-border); }
.file-preview-panel__identity { display: flex; min-width: 0; align-items: center; gap: var(--da-space-3); }
.file-preview-panel__identity > div { display: grid; min-width: 0; gap: 0.125rem; }
.file-preview-panel__identity b { overflow: hidden; color: var(--da-text-emphasis); font-size: var(--da-font-size-sm); text-overflow: ellipsis; white-space: nowrap; }
.file-preview-panel__identity small { color: var(--da-text-muted); font-size: var(--da-font-size-xs); }
.file-preview-panel__mark { display: grid; width: 2rem; height: 2rem; flex: 0 0 auto; place-items: center; border: 0.0625rem solid var(--da-border-strong); border-radius: var(--da-radius-sm); color: var(--da-accent-orange); background: var(--da-surface-2); font-size: var(--da-font-size-xs); font-weight: 700; letter-spacing: 0.04em; }
.file-preview-panel__actions { display: flex; align-items: center; gap: var(--da-space-1); }
.file-preview-panel__actions :is(a, button) { display: grid; width: 2rem; height: 2rem; padding: 0; place-items: center; border: 0; border-radius: var(--da-radius-sm); color: var(--da-text-muted); background: transparent; cursor: pointer; text-decoration: none; }
.file-preview-panel__actions :is(a, button):hover { color: var(--da-text-emphasis); background: var(--da-surface-3); }
.file-preview-panel__body { min-height: 0; overflow: auto; padding: var(--da-space-5); }
.file-preview-panel__approval { margin-bottom: var(--da-space-5); padding: var(--da-space-4); border: 0.0625rem solid color-mix(in srgb, var(--da-accent-yellow) 28%, var(--da-border)); border-radius: var(--da-radius-md); background: color-mix(in srgb, var(--da-accent-yellow) 4%, var(--da-surface-2)); }
.file-preview-panel__approval-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--da-space-3); margin-bottom: var(--da-space-3); }
.file-preview-panel__approval-heading > div { display: flex; align-items: center; gap: var(--da-space-2); }
.file-preview-panel__approval-heading i { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: var(--da-accent-yellow); box-shadow: 0 0 0.75rem color-mix(in srgb, var(--da-accent-yellow) 32%, transparent); }
.file-preview-panel__approval-heading span { color: var(--da-text-emphasis); font-size: var(--da-font-size-sm); font-weight: 600; }
.file-preview-panel__approval-heading small, .file-preview-panel__approval > p { color: var(--da-text-muted); font-size: var(--da-font-size-xs); }
.file-preview-panel__approval > p { margin: 0; }
.file-preview-panel__body > img { display: block; width: 100%; height: auto; border-radius: var(--da-radius-md); background: var(--da-surface-0); object-fit: contain; }
.file-preview-panel__body > iframe { width: 100%; height: 100%; min-height: 30rem; border: 0; border-radius: var(--da-radius-md); background: white; }
.file-preview-panel__markdown :deep(.x-md-renderer) { padding: 0 !important; color: var(--da-text-primary) !important; background: transparent !important; }
.file-preview-panel__markdown :deep(.x-md-core) { color: inherit; line-height: 1.75; }
.file-preview-panel__text pre { margin: 0; color: var(--da-text-primary); font: var(--da-font-size-sm)/1.7 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.file-preview-panel__state { display: grid; min-height: 18rem; place-content: center; justify-items: center; gap: var(--da-space-3); color: var(--da-text-muted); text-align: center; }
.file-preview-panel__state strong { color: var(--da-text-primary); }
.file-preview-panel__state p { max-width: 22rem; margin: 0; line-height: 1.6; }
.file-preview-panel__state a { padding: var(--da-space-2) var(--da-space-3); border: 0.0625rem solid var(--da-border-strong); border-radius: var(--da-radius-sm); color: var(--da-text-primary); text-decoration: none; }
.file-preview-panel__notice { margin-top: var(--da-space-4); color: var(--da-text-muted); font-size: var(--da-font-size-xs); }
</style>
