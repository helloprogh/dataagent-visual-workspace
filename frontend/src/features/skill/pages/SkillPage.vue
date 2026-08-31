<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { deleteSkill, listSkills, uploadSkill, type AgentSkill } from '../api/skill'

const skills = ref<AgentSkill[]>([])
const keyword = ref('')
const loading = ref(false)
const uploading = ref(false)
const deleting = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const filtered = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  if (!query) return skills.value
  return skills.value.filter(skill => [skill.name, skill.description, skill.id]
    .some(value => String(value ?? '').toLowerCase().includes(query)))
})

async function refresh() {
  loading.value = true
  try { skills.value = await listSkills() }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : String(error)) }
  finally { loading.value = false }
}

function chooseFile() { fileInput.value?.click() }

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.zip')) {
    ElMessage.error('技能包必须是 ZIP 文件')
    return
  }
  uploading.value = true
  try {
    await uploadSkill(file)
    await refresh()
    ElMessage.success('技能上传成功')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  } finally { uploading.value = false }
}

async function remove(item: AgentSkill) {
  try {
    await ElMessageBox.confirm(`确定删除技能「${item.name}」吗？`, '删除技能', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
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
          <h1>Skill 管理</h1>
          <p>查看和管理当前 Data Agent 可用的技能扩展。</p>
        </div>
        <el-button type="primary" :loading="uploading" @click="chooseFile">上传技能包</el-button>
      </header>

      <div class="skill-toolbar">
        <el-input v-model="keyword" clearable placeholder="搜索技能" />
        <el-button :loading="loading" @click="refresh">刷新</el-button>
      </div>

      <div v-loading="loading" class="skill-list">
        <article v-for="skill in filtered" :key="skill.name" class="skill-row">
          <div class="skill-row__mark">S</div>
          <div class="skill-row__copy">
            <b>{{ skill.name }}</b>
            <small>{{ skill.description || skill.id || '技能扩展' }}</small>
          </div>
          <el-button text type="danger" :loading="deleting === skill.name" @click="remove(skill)">删除</el-button>
        </article>
        <div v-if="!loading && !filtered.length" class="empty-state">{{ keyword ? '没有匹配的技能' : '暂未安装技能' }}</div>
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
