<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { deleteSkill, listSkills, uploadSkill, type AgentSkill } from '../api/skill'
import { useAsyncResource } from '../../../shared/composables/useAsyncResource'

const { data: skills, loading, refresh } = useAsyncResource<AgentSkill[]>({
  initial: () => [],
  load: listSkills,
  onError: error => ElMessage.error(error instanceof Error ? error.message : String(error)),
})
const keyword = ref('')
const uploading = ref(false)
const deleting = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const { t } = useI18n()

const filtered = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  if (!query) return skills.value
  return skills.value.filter(skill => [skill.name, skill.description, skill.id]
    .some(value => String(value ?? '').toLowerCase().includes(query)))
})

function chooseFile() { fileInput.value?.click() }

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.zip')) {
    ElMessage.error(t('skill.invalidZip'))
    return
  }
  uploading.value = true
  try {
    await uploadSkill(file)
    await refresh()
    ElMessage.success(t('skill.uploaded'))
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  } finally { uploading.value = false }
}

async function remove(item: AgentSkill) {
  try {
    await ElMessageBox.confirm(t('skill.removeConfirm', { name: item.name }), t('skill.removeTitle'), {
      type: 'warning', confirmButtonText: t('skill.remove'), cancelButtonText: t('app.cancel'),
    })
  } catch { return }
  deleting.value = item.name
  try {
    await deleteSkill(item.name)
    await refresh()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  } finally { deleting.value = '' }
}

onMounted(refresh)
</script>

<template>
  <section class="app-page">
    <div class="app-page__inner">
      <header class="app-page__header">
        <div>
          <h1>{{ t('skill.title') }}</h1>
          <p>{{ t('skill.description') }}</p>
        </div>
        <el-button type="primary" :loading="uploading" @click="chooseFile">{{ t('skill.upload') }}</el-button>
      </header>

      <div class="skill-toolbar">
        <el-input v-model="keyword" clearable :placeholder="t('skill.search')" />
        <el-button :loading="loading" @click="refresh">{{ t('app.refresh') }}</el-button>
      </div>

      <div v-loading="loading" class="skill-list">
        <article v-for="skill in filtered" :key="skill.name" class="skill-row">
          <div class="skill-row__mark">S</div>
          <div class="skill-row__copy">
            <b>{{ skill.name }}</b>
            <small>{{ skill.description || skill.id || t('skill.extension') }}</small>
          </div>
          <el-button text type="danger" :loading="deleting === skill.name" @click="remove(skill)">{{ t('skill.remove') }}</el-button>
        </article>
        <div v-if="!loading && !filtered.length" class="empty-state">{{ keyword ? t('skill.noMatches') : t('skill.empty') }}</div>
      </div>

      <input ref="fileInput" class="hidden-input" type="file" accept=".zip,application/zip" @change="onFile" />
    </div>
  </section>
</template>

<style scoped>
.app-page__header p { margin: var(--da-space-2) 0 0; color: var(--da-text-muted); }
.skill-toolbar { display: flex; gap: var(--da-space-2); margin-bottom: var(--da-space-4); }
.skill-toolbar .el-input { max-width: 26rem; }
.skill-list { overflow: hidden; min-height: 12rem; border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-lg); background: var(--da-surface-1); }
.skill-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--da-space-3); padding: var(--da-space-4); }
.skill-row + .skill-row { border-top: 0.0625rem solid var(--da-border); }
.skill-row__mark { display: grid; width: 2.25rem; height: 2.25rem; place-items: center; border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-md); color: var(--da-accent-orange); background: var(--da-surface-2); font-weight: 700; }
.skill-row__copy { min-width: 0; display: flex; flex-direction: column; gap: var(--da-space-1); }
.skill-row__copy b { color: var(--da-text-emphasis); }
.skill-row__copy small { overflow: hidden; color: var(--da-text-muted); text-overflow: ellipsis; white-space: nowrap; }
.hidden-input { display: none; }
</style>
