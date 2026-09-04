<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Interrupt, ResumeEntry } from '@ag-ui/client'
import { useI18n } from 'vue-i18n'
import { MarkdownRenderer } from 'x-markdown-vue'
import { appTheme } from '../../../shared/theme/theme'
import { dataAgentWebApi } from '../../../shared/config/api'
import { buildCancellationResumeEntry, buildConfirmationResumeEntry } from '../approval'
import { fileBadgeLabel, fileDownloadUrl, fileKindLabel, formatFileSize, type ArchiveEntry, type ConversationFilePreview } from '../types/filePreview'
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
const { t } = useI18n()

const MAX_TEXT_BYTES = 1024 * 1024
const content = ref('')
const loading = ref(false)
const error = ref('')
const truncated = ref(false)
const showApprovalOptions = ref(false)
const archiveEntries = ref<ArchiveEntry[]>([])
const archiveEntryPath = ref('')
const archiveEntryContent = ref('')
const archiveEntryMimeType = ref('')
const archiveEntryUrl = ref('')
const archiveLoading = ref(false)
const archiveError = ref('')
let controller: AbortController | null = null
let archiveController: AbortController | null = null

const extension = computed(() => props.file.name.split('.').pop()?.toLowerCase() ?? '')
const kind = computed(() => {
  if (props.file.mimeType === 'text/markdown' || ['md', 'markdown', 'mdx'].includes(extension.value)) return 'markdown'
  if (props.file.mimeType.startsWith('image/')) return 'image'
  if (props.file.mimeType === 'application/pdf' || extension.value === 'pdf') return 'pdf'
  if (props.file.mimeType === 'application/zip' || extension.value === 'zip') return 'archive'
  if (props.file.mimeType.startsWith('text/') || ['json', 'yaml', 'yml', 'csv', 'sql', 'xml', 'log'].includes(extension.value)) return 'text'
  return 'unsupported'
})
const archiveUrl = computed(() => {
  if (kind.value !== 'archive') return ''
  try {
    const source = new URL(props.file.url, window.location.origin)
    const workspacePath = source.searchParams.get('path')
    return workspacePath
      ? `${dataAgentWebApi('/agui/workspace-archive')}?path=${encodeURIComponent(workspacePath)}`
      : ''
  } catch { return '' }
})
const archiveTreeEntries = computed(() => {
  const entries = new Map<string, ArchiveEntry>()
  for (const rawEntry of archiveEntries.value) {
    const entry = { ...rawEntry, path: rawEntry.kind === 'directory' ? rawEntry.path.replace(/\/+$/, '') : rawEntry.path }
    if (!entry.path) continue
    entries.set(entry.path, entry)
    const segments = entry.path.split('/')
    for (let index = 1; index < segments.length; index += 1) {
      const directory = segments.slice(0, index).join('/')
      if (!entries.has(directory)) entries.set(directory, { path: directory, kind: 'directory', size: 0 })
    }
  }
  return [...entries.values()].sort((left, right) => left.path.localeCompare(right.path) || left.kind.localeCompare(right.kind))
})
const archiveEntryKind = computed(() => {
  const name = archiveEntryPath.value.toLowerCase()
  if (archiveEntryMimeType.value === 'text/markdown' || /\.(?:md|markdown|mdx)$/.test(name)) return 'markdown'
  if (archiveEntryMimeType.value.startsWith('image/')) return 'image'
  if (archiveEntryMimeType.value === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (archiveEntryMimeType.value.startsWith('text/') || /\.(?:json|yaml|yml|csv|sql|xml|log|txt)$/.test(name)) return 'text'
  return 'unsupported'
})
const confirmationEntry = computed(() => props.interrupts.length === 1
  ? buildConfirmationResumeEntry(props.interrupts[0])
  : null)
const cancellationEntry = computed(() => props.interrupts.length === 1
  ? buildCancellationResumeEntry(props.interrupts[0])
  : null)
const approvalHandled = computed(() => props.approvalSubmitted || props.file.approvalResolved)

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
    if (!response.ok) throw new Error(`${t('preview.unavailable')} (${response.status})`)
    const declaredSize = Number(response.headers.get('content-length') ?? 0)
    if (declaredSize > MAX_TEXT_BYTES) throw new Error(t('preview.tooLarge'))
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

async function loadArchive() {
  archiveController?.abort()
  archiveLoading.value = false
  if (archiveEntryUrl.value) URL.revokeObjectURL(archiveEntryUrl.value)
  archiveEntries.value = []
  archiveEntryPath.value = ''
  archiveEntryContent.value = ''
  archiveEntryMimeType.value = ''
  archiveEntryUrl.value = ''
  archiveError.value = ''
  if (!archiveUrl.value) {
    if (kind.value === 'archive') archiveError.value = t('preview.archiveUnavailable')
    return
  }

  const nextController = new AbortController()
  archiveController = nextController
  archiveLoading.value = true
  try {
    const response = await fetch(archiveUrl.value, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: nextController.signal,
    })
    if (!response.ok) throw new Error(`${t('preview.archiveUnavailable')} (${response.status})`)
    const body = await response.json()
    const entries = body?.data?.entries
    if (!Array.isArray(entries)) throw new Error(t('preview.archiveUnavailable'))
    archiveEntries.value = entries
  } catch (reason) {
    if (nextController.signal.aborted) return
    archiveError.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    if (archiveController === nextController) archiveLoading.value = false
  }
}

async function openArchiveEntry(entry: ArchiveEntry) {
  if (entry.kind !== 'file' || !archiveUrl.value) return
  archiveController?.abort()
  if (archiveEntryUrl.value) URL.revokeObjectURL(archiveEntryUrl.value)
  archiveEntryPath.value = entry.path
  archiveEntryContent.value = ''
  archiveEntryMimeType.value = ''
  archiveEntryUrl.value = ''
  archiveError.value = ''
  const nextController = new AbortController()
  archiveController = nextController
  archiveLoading.value = true
  try {
    const response = await fetch(`${archiveUrl.value}&entry=${encodeURIComponent(entry.path)}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: nextController.signal,
    })
    if (!response.ok) throw new Error(`${t('preview.unavailable')} (${response.status})`)
    archiveEntryMimeType.value = (response.headers.get('content-type') ?? 'application/octet-stream').split(';', 1)[0] || 'application/octet-stream'
    const blob = await response.blob()
    if (archiveEntryKind.value === 'text' || archiveEntryKind.value === 'markdown') archiveEntryContent.value = await blob.text()
    else archiveEntryUrl.value = URL.createObjectURL(blob)
  } catch (reason) {
    if (nextController.signal.aborted) return
    archiveError.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    if (archiveController === nextController) archiveLoading.value = false
  }
}

function archiveDepth(entryPath: string) {
  return Math.max(0, entryPath.split('/').length - 1)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

watch(() => props.file, () => {
  showApprovalOptions.value = false
  void loadText()
  void loadArchive()
}, { immediate: true })
window.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => {
  controller?.abort()
  archiveController?.abort()
  if (archiveEntryUrl.value) URL.revokeObjectURL(archiveEntryUrl.value)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <aside class="file-preview-panel" :aria-label="t('preview.label')" data-testid="file-preview-panel">
    <header class="file-preview-panel__header">
      <div class="file-preview-panel__identity">
        <span class="file-preview-panel__mark">{{ fileBadgeLabel(file) }}</span>
        <div>
          <b :title="file.name">{{ file.name }}</b>
          <small>{{ [fileKindLabel(file), formatFileSize(file.size)].filter(Boolean).join(' · ') }}</small>
        </div>
      </div>
      <div class="file-preview-panel__actions">
        <span v-if="file.version" class="file-preview-panel__version">v{{ file.version }}</span>
        <a :href="fileDownloadUrl(file)" :download="file.name" :aria-label="t('preview.download')" :title="t('preview.download')">↓</a>
        <a :href="fileDownloadUrl(file)" target="_blank" rel="noreferrer" :aria-label="t('preview.openNew')">↗</a>
        <button type="button" :aria-label="t('preview.close')" @click="emit('close')">×</button>
      </div>
    </header>

    <div class="file-preview-panel__body">
      <el-skeleton v-if="loading" :rows="12" animated />

      <div v-else-if="error" class="file-preview-panel__state">
        <strong>{{ t('preview.unavailable') }}</strong>
        <p>{{ error }}</p>
        <a :href="file.url" target="_blank" rel="noreferrer">{{ t('preview.openOriginal') }}</a>
      </div>

      <img v-else-if="kind === 'image'" :src="file.url" :alt="file.name" />

      <iframe
        v-else-if="kind === 'pdf'"
        :src="file.url"
        :title="t('preview.title', { name: file.name })"
      ></iframe>

      <div v-else-if="kind === 'markdown'" class="file-preview-panel__markdown">
        <MarkdownRenderer
          :markdown="content"
          :sanitize="true"
          :is-dark="appTheme === 'dark'"
          :enable-shiki="false"
          :enable-mermaid="false"
        />
        <p v-if="truncated" class="file-preview-panel__notice">{{ t('preview.notice') }}</p>
      </div>

      <div v-else-if="kind === 'text'" class="file-preview-panel__text">
        <pre>{{ content }}</pre>
        <p v-if="truncated" class="file-preview-panel__notice">{{ t('preview.notice') }}</p>
      </div>

      <section v-else-if="kind === 'archive'" class="archive-preview" :aria-busy="archiveLoading">
        <aside class="archive-preview__tree" :aria-label="file.name">
          <el-skeleton v-if="archiveLoading && !archiveTreeEntries.length" :rows="8" animated />
          <div v-else-if="archiveError && !archiveTreeEntries.length" class="file-preview-panel__state">
            <strong>{{ t('preview.archiveUnavailable') }}</strong>
            <p>{{ archiveError }}</p>
          </div>
          <p v-else-if="!archiveTreeEntries.length" class="archive-preview__empty">{{ t('preview.archiveEmpty') }}</p>
          <template v-else>
            <button
              v-for="entry in archiveTreeEntries"
              :key="entry.path"
              type="button"
              class="archive-preview__entry"
              :class="{ 'archive-preview__entry--active': entry.path === archiveEntryPath, 'archive-preview__entry--directory': entry.kind === 'directory' }"
              :style="{ paddingLeft: `${0.625 + archiveDepth(entry.path) * 0.875}rem` }"
              :disabled="entry.kind === 'directory' || archiveLoading"
              :title="entry.path"
              :aria-pressed="entry.kind === 'file' ? entry.path === archiveEntryPath : undefined"
              @click="openArchiveEntry(entry)"
            >
              <span aria-hidden="true">{{ entry.kind === 'directory' ? '▾' : '·' }}</span>
              <span>{{ entry.path.split('/').pop() }}</span>
              <small v-if="entry.kind === 'file'">{{ formatFileSize(entry.size) }}</small>
            </button>
          </template>
        </aside>
        <div class="archive-preview__content">
          <div v-if="archiveEntryPath" class="archive-preview__path" :title="archiveEntryPath">{{ archiveEntryPath }}</div>
          <el-skeleton v-if="archiveLoading && archiveEntryPath" :rows="12" animated />
          <div v-else-if="archiveError" class="file-preview-panel__state">
            <strong>{{ t('preview.unavailable') }}</strong>
            <p>{{ archiveError }}</p>
          </div>
          <div v-else-if="!archiveEntryPath" class="file-preview-panel__state">
            <strong>{{ file.name }}</strong>
            <p>{{ t('preview.archiveOpenHint') }}</p>
          </div>
          <MarkdownRenderer
            v-else-if="archiveEntryKind === 'markdown'"
            :markdown="archiveEntryContent"
            :sanitize="true"
            :is-dark="appTheme === 'dark'"
            :enable-shiki="false"
            :enable-mermaid="false"
          />
          <pre v-else-if="archiveEntryKind === 'text'" class="archive-preview__text">{{ archiveEntryContent }}</pre>
          <img v-else-if="archiveEntryKind === 'image'" class="archive-preview__media" :src="archiveEntryUrl" :alt="archiveEntryPath" />
          <iframe v-else-if="archiveEntryKind === 'pdf'" class="archive-preview__frame" :src="archiveEntryUrl" :title="archiveEntryPath"></iframe>
          <div v-else class="file-preview-panel__state">
            <strong>{{ t('preview.unsupported') }}</strong>
            <p>{{ t('preview.unsupportedHint') }}</p>
            <a :href="`${archiveUrl}&entry=${encodeURIComponent(archiveEntryPath)}`" target="_blank" rel="noreferrer">{{ t('preview.openOriginal') }}</a>
          </div>
        </div>
      </section>

      <div v-else class="file-preview-panel__state">
        <strong>{{ t('preview.unsupported') }}</strong>
        <p>{{ t('preview.unsupportedHint') }}</p>
        <a :href="file.url" target="_blank" rel="noreferrer">{{ t('preview.openOriginal') }}</a>
      </div>
    </div>

    <footer v-if="interrupts.length || approvalHandled" class="file-preview-panel__approval">
      <div class="file-preview-panel__approval-heading">
        <div>
          <i aria-hidden="true"></i>
          <span>{{ t('preview.approval') }}</span>
        </div>
        <small>{{ approvalHandled ? t('preview.handled') : t('preview.approvalHint') }}</small>
      </div>
      <button
        v-if="confirmationEntry && !approvalHandled"
        type="button"
        class="file-preview-panel__confirm"
        :disabled="busy"
        @click="emit('resume', [confirmationEntry])"
      >{{ busy ? t('chat.responseOrganizing') : t('app.confirmContinue') }}</button>
      <button
        v-if="cancellationEntry && !approvalHandled"
        type="button"
        class="file-preview-panel__cancel"
        :disabled="busy"
        @click="emit('resume', [cancellationEntry])"
      >{{ t('app.cancel') }}</button>
      <button
        v-if="confirmationEntry && !approvalHandled"
        type="button"
        class="file-preview-panel__more"
        :disabled="busy"
        :aria-expanded="showApprovalOptions"
        @click="showApprovalOptions = !showApprovalOptions"
      >{{ showApprovalOptions ? t('preview.collapse') : t('preview.other') }}</button>
      <InterruptCard
        v-if="interrupts.length && !approvalHandled && (!confirmationEntry || showApprovalOptions)"
        variant="embedded"
        :interrupts="interrupts"
        :busy="busy"
        @resume="emit('resume', $event)"
      />
      <p v-else-if="approvalHandled">{{ t('preview.sent') }}</p>
    </footer>
  </aside>
</template>

<style scoped>
.file-preview-panel { container: preview / inline-size; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; min-width: 0; min-height: 0; border-left: 0.0625rem solid var(--da-border-strong); background: var(--da-surface-1); box-shadow: -1.5rem 0 4rem rgb(0 0 0 / 12%); animation: preview-enter 240ms var(--da-ease-out); }
.file-preview-panel__header { display: flex; min-height: 3.75rem; align-items: center; justify-content: space-between; gap: var(--da-space-4); padding: 0 var(--da-space-4); border-bottom: 0.0625rem solid var(--da-border); }
.file-preview-panel__identity { display: flex; min-width: 0; align-items: center; gap: var(--da-space-3); }
.file-preview-panel__identity > div { display: grid; min-width: 0; gap: 0.125rem; }
.file-preview-panel__identity b { overflow: hidden; color: var(--da-text-emphasis); font-size: var(--da-font-size-sm); text-overflow: ellipsis; white-space: nowrap; }
.file-preview-panel__identity small { color: var(--da-text-muted); font-size: var(--da-font-size-xs); }
.file-preview-panel__mark { display: grid; width: 2rem; height: 2rem; flex: 0 0 auto; place-items: center; border: 0.0625rem solid var(--da-border-strong); border-radius: var(--da-radius-sm); color: var(--da-accent-orange); background: var(--da-surface-2); font-size: var(--da-font-size-xs); font-weight: 700; letter-spacing: 0.04em; }
.file-preview-panel__actions { display: flex; align-items: center; gap: var(--da-space-1); }
.file-preview-panel__version { padding: 0.1875rem 0.375rem; border-radius: 999rem; color: var(--da-brand-cyan); background: var(--da-surface-3); font-size: 0.625rem; }
.file-preview-panel__actions :is(a, button) { display: grid; width: 2rem; height: 2rem; padding: 0; place-items: center; border: 0; border-radius: var(--da-radius-sm); color: var(--da-text-muted); background: transparent; cursor: pointer; text-decoration: none; }
.file-preview-panel__actions :is(a, button):hover { color: var(--da-text-emphasis); background: var(--da-surface-3); }
.file-preview-panel__body { min-height: 0; overflow: auto; padding: var(--da-space-5); }
.file-preview-panel__approval { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--da-space-3) var(--da-space-4); padding: var(--da-space-4); border-top: 0.0625rem solid color-mix(in srgb, var(--da-accent-yellow) 28%, var(--da-border)); background: color-mix(in srgb, var(--da-accent-yellow) 4%, var(--da-surface-2)); box-shadow: 0 -0.75rem 2rem rgb(0 0 0 / 8%); }
.file-preview-panel__approval-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--da-space-3); margin-bottom: var(--da-space-3); }
.file-preview-panel__approval-heading > div { display: flex; align-items: center; gap: var(--da-space-2); }
.file-preview-panel__approval-heading i { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: var(--da-accent-yellow); box-shadow: 0 0 0.75rem color-mix(in srgb, var(--da-accent-yellow) 32%, transparent); }
.file-preview-panel__approval-heading span { color: var(--da-text-emphasis); font-size: var(--da-font-size-sm); font-weight: 600; }
.file-preview-panel__approval-heading small, .file-preview-panel__approval > p { color: var(--da-text-muted); font-size: var(--da-font-size-xs); }
.file-preview-panel__approval-heading { margin: 0; }
.file-preview-panel__approval > :is(.interrupt-card, p) { grid-column: 1 / -1; }
.file-preview-panel__approval > p { margin: 0; }
.file-preview-panel__confirm { grid-column: 2; grid-row: 1; min-width: 7.5rem; padding: var(--da-space-2) var(--da-space-4); border: 0.0625rem solid color-mix(in srgb, var(--da-accent-blue) 60%, var(--da-border)); border-radius: var(--da-radius-sm); color: white; background: var(--da-accent-blue); cursor: pointer; font-weight: 600; }
.file-preview-panel__confirm:disabled { cursor: wait; opacity: 0.65; }
.file-preview-panel__cancel { grid-column: 2; grid-row: 2; min-width: 7.5rem; padding: var(--da-space-2) var(--da-space-4); border: 0.0625rem solid var(--da-border-strong); border-radius: var(--da-radius-sm); color: var(--da-text-secondary); background: var(--da-surface-2); cursor: pointer; }
.file-preview-panel__cancel:disabled { cursor: wait; opacity: 0.65; }
.file-preview-panel__more { grid-column: 2; padding: 0; border: 0; color: var(--da-text-muted); background: transparent; cursor: pointer; font-size: var(--da-font-size-xs); text-align: right; }
.file-preview-panel__more:hover { color: var(--da-text-emphasis); }
.file-preview-panel__body > img { display: block; width: 100%; height: auto; border-radius: var(--da-radius-md); background: var(--da-surface-0); object-fit: contain; }
.file-preview-panel__body > iframe { width: 100%; height: 100%; min-height: 24rem; border: 0; border-radius: var(--da-radius-md); background: white; }
.file-preview-panel__markdown :deep(.x-md-renderer) { padding: 0 !important; color: var(--da-text-primary) !important; background: transparent !important; }
.file-preview-panel__markdown :deep(.x-md-core) { color: inherit; line-height: 1.75; }
.file-preview-panel__text pre { margin: 0; color: var(--da-text-primary); font: var(--da-font-size-sm)/1.7 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.file-preview-panel__state { display: grid; min-height: 18rem; place-content: center; justify-items: center; gap: var(--da-space-3); color: var(--da-text-muted); text-align: center; }
.file-preview-panel__state strong { color: var(--da-text-primary); }
.file-preview-panel__state p { max-width: 22rem; margin: 0; line-height: 1.6; }
.file-preview-panel__state a { padding: var(--da-space-2) var(--da-space-3); border: 0.0625rem solid var(--da-border-strong); border-radius: var(--da-radius-sm); color: var(--da-text-primary); text-decoration: none; }
.file-preview-panel__notice { margin-top: var(--da-space-4); color: var(--da-text-muted); font-size: var(--da-font-size-xs); }
.archive-preview { display: grid; height: 100%; min-height: 20rem; grid-template-columns: minmax(13rem, 40%) minmax(0, 1fr); gap: var(--da-space-3); }
.archive-preview__path { position: sticky; top: calc(-1 * var(--da-space-3)); z-index: 1; margin: calc(-1 * var(--da-space-3)) calc(-1 * var(--da-space-3)) var(--da-space-4); padding: var(--da-space-3); border-bottom: 0.0625rem solid var(--da-border); color: var(--da-brand-cyan); background: var(--da-surface-2); font: 0.6875rem/1.6 ui-monospace, Consolas, monospace; overflow-wrap: anywhere; }
.archive-preview__tree { min-width: 0; overflow: auto; padding: var(--da-space-2); border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-md); background: var(--da-surface-2); }
.archive-preview__entry { display: grid; width: 100%; grid-template-columns: 1rem minmax(0, 1fr) auto; align-items: center; gap: var(--da-space-1); min-height: 1.875rem; padding-top: var(--da-space-1); padding-right: var(--da-space-2); padding-bottom: var(--da-space-1); border: 0; border-radius: var(--da-radius-sm); color: var(--da-text-secondary); background: transparent; cursor: pointer; font: inherit; text-align: left; }
.archive-preview__entry:hover, .archive-preview__entry--active { color: var(--da-text-emphasis); background: var(--da-surface-3); }
.archive-preview__entry--active { color: var(--da-accent-primary); background: var(--da-accent-primary-soft); box-shadow: inset 0.125rem 0 var(--da-accent-primary); }
.archive-preview__entry--directory { color: var(--da-text-muted); cursor: default; }
.archive-preview__entry > span:nth-child(2) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.archive-preview__entry small { color: var(--da-text-subtle); font-size: 0.625rem; }
.archive-preview__empty { padding: var(--da-space-3); color: var(--da-text-muted); font-size: var(--da-font-size-xs); }
.archive-preview__content { min-width: 0; overflow: auto; padding: var(--da-space-3); border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-md); background: var(--da-surface-0); }
.archive-preview__content :deep(.x-md-renderer) { padding: 0 !important; color: var(--da-text-primary) !important; background: transparent !important; }
.archive-preview__content :deep(.x-md-core) { color: inherit; line-height: 1.75; }
.archive-preview__text { margin: 0; color: var(--da-text-primary); font: var(--da-font-size-sm)/1.7 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.archive-preview__media { display: block; width: 100%; height: auto; object-fit: contain; }
.archive-preview__frame { width: 100%; height: 100%; min-height: 24rem; border: 0; background: white; }
@media (max-width: 40rem) { .file-preview-panel__approval { grid-template-columns: 1fr; } .file-preview-panel__confirm, .file-preview-panel__cancel, .file-preview-panel__more { grid-column: 1; grid-row: auto; width: 100%; text-align: center; } }
@container preview (max-width: 34rem) { .archive-preview { grid-template-columns: 1fr; grid-template-rows: minmax(8rem, 32%) minmax(12rem, 1fr); } }
@keyframes preview-enter { from { opacity: 0; transform: translateX(1rem); } }
@media (prefers-reduced-motion: reduce) { .file-preview-panel { animation: none; } }
</style>
