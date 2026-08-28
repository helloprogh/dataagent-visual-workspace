<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  deleteAgentSkill,
  listAgentSkills,
  uploadAgentSkill,
  type AgentSkill,
} from '../opencode/management'

const skills = ref<AgentSkill[]>([])
const loading = ref(false)
const uploading = ref(false)
const deletingName = ref('')
const error = ref('')
const keyword = ref('')
const fileInput = ref<HTMLInputElement>()

const filteredSkills = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  if (!query) return skills.value
  return skills.value.filter(skill => [skill.name, skill.description, skill.id]
    .some(value => String(value ?? '').toLowerCase().includes(query)))
})

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    skills.value = await listAgentSkills()
  } catch (cause) {
    console.error('[skill-management] load failed', cause)
    skills.value = []
    error.value = '技能数据加载失败，请稍后重试。'
  } finally {
    loading.value = false
  }
}

function choosePackage() {
  if (!uploading.value) fileInput.value?.click()
}

async function onPackageSelected(event: Event) {
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
    await uploadAgentSkill(file)
    await refresh()
    ElMessage.success('技能上传成功')
  } catch (cause) {
    console.error('[skill-management] upload failed', cause)
    ElMessage.error('技能上传失败，请检查技能包后重试。')
  } finally {
    uploading.value = false
  }
}

async function removeSkill(skill: AgentSkill) {
  try {
    await ElMessageBox.confirm(
      `确定删除技能「${skill.name}」吗？`,
      '删除技能',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return
  }

  deletingName.value = skill.name
  try {
    await deleteAgentSkill(skill.name)
    await refresh()
    ElMessage.success(`技能 ${skill.name} 已删除`)
  } catch (cause) {
    console.error('[skill-management] delete failed', cause)
    ElMessage.error('技能删除失败，请刷新后重试。')
  } finally {
    deletingName.value = ''
  }
}

onMounted(refresh)
</script>

<template>
  <section class="management-page skill-page opencode-management-page">
    <header class="management-page__header">
      <div>
        <span class="management-page__eyebrow">技能管理</span>
        <h1>Skill 管理</h1>
        <p>查看、搜索和管理当前助手可使用的技能扩展。</p>
      </div>
      <div class="opencode-header-actions">
        <button class="management-page__primary" type="button" :disabled="uploading" @click="choosePackage">
          <svg viewBox="0 0 20 20"><path d="M10 13V4M6.5 7.5 10 4l3.5 3.5M4 12v3.5h12V12" /></svg>
          {{ uploading ? '上传中…' : '上传技能包' }}
        </button>
        <input
          ref="fileInput"
          class="opencode-hidden-file"
          type="file"
          accept=".zip,application/zip"
          @change="onPackageSelected"
        >
      </div>
    </header>

    <div v-if="error" class="opencode-error-banner">
      <b>技能加载失败</b>
      <span>{{ error }}</span>
      <button type="button" @click="refresh">重试</button>
    </div>

    <section class="management-surface skill-management-simple">
      <div class="management-surface__head">
        <div>
          <b>技能列表</b>
          <span>共 {{ skills.length }} 项</span>
        </div>
        <div class="management-surface__actions">
          <el-input
            v-model="keyword"
            clearable
            placeholder="搜索技能"
            class="management-page__search compact"
          />
          <button type="button" :disabled="loading" @click="refresh">刷新</button>
        </div>
      </div>

      <div class="opencode-skill-list-head simple">
        <span>技能</span>
        <span>操作</span>
      </div>

      <div v-loading="loading" class="opencode-skill-list">
        <article
          v-for="skill in filteredSkills"
          :key="skill.name"
          class="opencode-skill-row simple"
        >
          <span class="opencode-row-icon">
            <svg viewBox="0 0 20 20"><path d="M5 4.5h6l1.5 2H15a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z"/><path d="M7.5 11h5M10 8.5v5"/></svg>
          </span>
          <div class="opencode-row-primary">
            <b>{{ skill.name }}</b>
            <small>{{ skill.description || skill.id || '技能扩展' }}</small>
          </div>
          <button
            class="opencode-danger-button"
            type="button"
            :disabled="deletingName === skill.name"
            title="删除技能"
            aria-label="删除技能"
            @click="removeSkill(skill)"
          >
            <svg viewBox="0 0 20 20"><path d="M5.5 6.5h9M8 6.5V4.5h4v2M7 8.5v6M10 8.5v6M13 8.5v6M6 6.5l.7 10h6.6l.7-10"/></svg>
          </button>
        </article>

        <div v-if="!loading && filteredSkills.length === 0 && !error" class="skill-empty-state">
          <div class="skill-empty-state__icon">
            <svg viewBox="0 0 24 24"><path d="M5 5h7l2 3h5v11H5z"/><path d="M9 13h6M12 10v6"/></svg>
          </div>
          <b>{{ keyword ? '没有匹配的技能' : '暂未安装技能' }}</b>
          <p>{{ keyword ? '尝试调整搜索关键词。' : '点击“上传技能包”即可添加新的技能扩展。' }}</p>
        </div>
      </div>
    </section>
  </section>
</template>
