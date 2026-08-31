<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Crepe } from '@milkdown/crepe'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
import { dataAgentWebApi } from '../../config/api'
import type { ArtifactReference } from '../../artifacts/types'

const props = defineProps<{ artifact: ArtifactReference }>()
const emit = defineEmits<{ versionChanged: [version: string] }>()

const editorRoot = ref<HTMLElement | null>(null)
const loading = ref(false)
const saving = ref(false)
const editing = ref(false)
const error = ref('')
const loadedVersion = ref('')
let editor: Crepe | null = null

function endpoint(version?: string) {
  const base = dataAgentWebApi(`/spec/${encodeURIComponent(props.artifact.artifactId)}`)
  if (!version) return base
  return `${base}?version=${encodeURIComponent(version)}`
}

async function destroyEditor() {
  const current = editor
  editor = null
  if (current) await current.destroy().catch(() => undefined)
}

async function load() {
  loading.value = true
  error.value = ''
  editing.value = false
  await destroyEditor()
  try {
    const response = await fetch(endpoint(props.artifact.version), {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`加载 Spec 失败 (${response.status})`)
    const body = await response.json() as Record<string, unknown>
    const content = typeof body.content === 'string' ? body.content : ''
    loadedVersion.value = typeof body.version === 'string' ? body.version : (props.artifact.version ?? '')
    await nextTick()
    if (!editorRoot.value) return
    editor = new Crepe({
      root: editorRoot.value,
      defaultValue: content,
      features: {
        [Crepe.Feature.AI]: false,
        [Crepe.Feature.Latex]: false,
        [Crepe.Feature.ImageBlock]: false,
        [Crepe.Feature.TopBar]: false,
      },
    })
    await editor.create()
    editor.setReadonly(true)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    loading.value = false
  }
}

function startEdit() {
  if (!editor) return
  editing.value = true
  editor.setReadonly(false)
}

function cancelEdit() {
  if (!editor) return
  editing.value = false
  editor.setReadonly(true)
  void load()
}

async function save() {
  if (!editor || saving.value) return
  saving.value = true
  try {
    const response = await fetch(endpoint(), {
      method: 'PATCH',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify({
        baseVersion: loadedVersion.value || props.artifact.version,
        content: editor.getMarkdown(),
      }),
    })
    if (!response.ok) {
      if (response.status === 409) throw new Error('Spec 已产生新版本，请刷新后重新编辑')
      throw new Error(`保存 Spec 失败 (${response.status})`)
    }
    const body = await response.json() as Record<string, unknown>
    const version = typeof body.version === 'string' ? body.version : loadedVersion.value
    loadedVersion.value = version
    editing.value = false
    editor.setReadonly(true)
    if (version) emit('versionChanged', version)
    ElMessage.success('Spec 已保存')
  } catch (reason) {
    ElMessage.error(reason instanceof Error ? reason.message : String(reason))
  } finally {
    saving.value = false
  }
}

watch(() => [props.artifact.artifactId, props.artifact.version] as const, () => void load(), { immediate: true })
onBeforeUnmount(() => void destroyEditor())
</script>

<template>
  <section class="spec-artifact-view">
    <div class="spec-artifact-view__toolbar">
      <div>
        <span>Markdown Spec</span>
        <b v-if="loadedVersion">{{ loadedVersion }}</b>
      </div>
      <div class="spec-artifact-view__actions">
        <el-button v-if="!editing" size="small" :disabled="loading || Boolean(error)" @click="startEdit">编辑</el-button>
        <template v-else>
          <el-button size="small" :disabled="saving" @click="cancelEdit">取消</el-button>
          <el-button size="small" type="primary" :loading="saving" @click="save">保存</el-button>
        </template>
      </div>
    </div>

    <el-skeleton v-if="loading" :rows="10" animated />
    <el-alert v-else-if="error" :title="error" type="error" :closable="false" show-icon>
      <template #default>
        <el-button size="small" @click="load">重试</el-button>
      </template>
    </el-alert>
    <div v-show="!loading && !error" ref="editorRoot" class="spec-artifact-view__editor" :class="{ editing }" />
  </section>
</template>

<style scoped>
.spec-artifact-view{min-height:0;display:flex;flex:1;flex-direction:column;gap:14px}
.spec-artifact-view__toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:10px;border-bottom:1px solid var(--da-border)}
.spec-artifact-view__toolbar>div:first-child{display:flex;align-items:center;gap:8px;color:var(--da-text-muted);font-size:12px}
.spec-artifact-view__toolbar b{color:var(--da-text-primary);font-weight:620}
.spec-artifact-view__actions{display:flex;align-items:center;gap:8px}
.spec-artifact-view__editor{min-height:0;flex:1;overflow:auto;border:1px solid transparent;border-radius:10px;background:var(--da-surface-1);transition:border-color .16s ease}
.spec-artifact-view__editor.editing{border-color:var(--da-border-focus)}
.spec-artifact-view__editor :deep(.milkdown){min-height:100%;background:transparent;color:var(--da-text-primary);--crepe-base-font-size:14px}
.spec-artifact-view__editor :deep(.milkdown .ProseMirror){min-height:100%;padding:22px 28px;outline:none}
</style>
