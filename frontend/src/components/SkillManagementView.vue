<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  deleteOpenCodeSkill,
  installOpenCodeSkillPackage,
  listOpenCodeSkills,
  listOpenCodeWorkspaces,
  workspaceDirectory,
  workspaceId,
  type OpenCodeSkill,
  type OpenCodeWorkspace,
  type SkillInstallScope,
} from '../opencode/management'

const skills = ref<OpenCodeSkill[]>([])
const workspaces = ref<OpenCodeWorkspace[]>([])
const loading = ref(false)
const error = ref('')
const keyword = ref('')
const contextWorkspaceID = ref('')
const deletingKey = ref('')

const fileInput = ref<HTMLInputElement>()
const uploadDialog = ref(false)
const pendingPackage = ref<File>()
const uploadScope = ref<SkillInstallScope>('global')
const uploadWorkspaceID = ref('')
const replaceExisting = ref(false)
const uploading = ref(false)

const filteredSkills = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return skills.value
  return skills.value.filter(skill => [skill.id, skill.name, skill.description]
    .some(value => String(value ?? '').toLowerCase().includes(q)))
})

const slashCount = computed(() => skills.value.filter(skill => skill.slash).length)
const autoinvokeCount = computed(() => skills.value.filter(skill => skill.autoinvoke).length)

function normalizedLocation(skill: OpenCodeSkill) {
  return String(skill.location ?? '').replace(/\\/g, '/')
}

function skillKey(skill: OpenCodeSkill) {
  return `${skill.id}-${normalizedLocation(skill)}`
}

function skillScope(skill: OpenCodeSkill) {
  const location = normalizedLocation(skill)
  if (location.includes('/.opencode/skills/')) return 'Workspace'
  if (location.includes('/opencode/skills/')) return 'Global'
  return 'Managed'
}

function canDeleteSkill(skill: OpenCodeSkill) {
  const location = normalizedLocation(skill)
  if (!location) return false
  if (location.includes('/.opencode/skills/')) return Boolean(contextWorkspaceID.value)
  if (location.includes('/opencode/skills/')) return true
  return false
}

function deleteSkillTitle(skill: OpenCodeSkill) {
  const location = normalizedLocation(skill)
  if (!location) return '当前 Skill 不支持从界面删除'
  if (location.includes('/.opencode/skills/') && !contextWorkspaceID.value) {
    return '请先切换到该 Skill 所属工作空间'
  }
  if (!canDeleteSkill(skill)) return '当前 Skill 不支持从界面删除'
  return '删除 Skill'
}

function workspaceLabel(workspace: OpenCodeWorkspace) {
  return workspace.name || workspaceDirectory(workspace) || workspaceId(workspace)
}

async function loadSkills() {
  const workspace = workspaces.value.find(item => workspaceId(item) === contextWorkspaceID.value)
  skills.value = await listOpenCodeSkills(workspace
    ? { workspaceID: workspaceId(workspace), directory: workspaceDirectory(workspace) || undefined }
    : {})
}

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    const workspaceResult = await Promise.allSettled([listOpenCodeWorkspaces()])
    workspaces.value = workspaceResult[0].status === 'fulfilled' ? workspaceResult[0].value : []
    if (contextWorkspaceID.value && !workspaces.value.some(item => workspaceId(item) === contextWorkspaceID.value)) {
      contextWorkspaceID.value = ''
    }
    await loadSkills()
  } catch (cause) {
    console.error('[skill-management] load failed', cause)
    skills.value = []
    error.value = 'Skill 数据加载失败，请稍后重试。'
  } finally {
    loading.value = false
  }
}

watch(contextWorkspaceID, async () => {
  loading.value = true
  error.value = ''
  try {
    await loadSkills()
  } catch (cause) {
    console.error('[skill-management] scope switch failed', cause)
    skills.value = []
    error.value = '当前范围的 Skill 加载失败，请稍后重试。'
  } finally {
    loading.value = false
  }
})

function choosePackage() {
  fileInput.value?.click()
}

function onPackageSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.zip')) {
    ElMessage.error('技能包必须是 ZIP 文件')
    return
  }
  pendingPackage.value = file
  uploadScope.value = contextWorkspaceID.value ? 'workspace' : 'global'
  uploadWorkspaceID.value = contextWorkspaceID.value
  replaceExisting.value = false
  uploadDialog.value = true
}

async function installPackage() {
  if (!pendingPackage.value) return
  if (uploadScope.value === 'workspace' && !uploadWorkspaceID.value) {
    ElMessage.warning('请选择要安装到的工作空间')
    return
  }
  uploading.value = true
  try {
    const installed = await installOpenCodeSkillPackage(pendingPackage.value, {
      scope: uploadScope.value,
      workspaceID: uploadScope.value === 'workspace' ? uploadWorkspaceID.value : undefined,
      replace: replaceExisting.value,
    })
    uploadDialog.value = false
    if (installed.scope === 'workspace') contextWorkspaceID.value = installed.workspaceID || ''
    await refresh()
    ElMessage.success(`Skill ${installed.id} 已安装`)
  } catch (cause) {
    console.error('[skill-management] install failed', cause)
    const message = cause instanceof Error ? cause.message : String(cause)
    ElMessage.error(/already exists/i.test(message)
      ? '同名 Skill 已存在，可勾选覆盖后重新安装。'
      : '技能包安装失败，请检查技能包格式或安装范围。')
  } finally {
    uploading.value = false
  }
}

async function removeSkill(skill: OpenCodeSkill) {
  if (!canDeleteSkill(skill)) return
  const name = skill.name || skill.id
  try {
    await ElMessageBox.confirm(
      `将删除 Skill「${name}」及其全部技能文件，是否继续？`,
      '删除 Skill',
      {
        type: 'warning',
        confirmButtonText: '删除 Skill',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return
  }

  deletingKey.value = skillKey(skill)
  try {
    await deleteOpenCodeSkill(skill, {
      workspaceID: contextWorkspaceID.value || undefined,
    })
    await loadSkills()
    ElMessage.success(`Skill ${name} 已删除`)
  } catch (cause) {
    console.error('[skill-management] delete failed', cause)
    ElMessage.error('Skill 删除失败，请刷新后重试。')
  } finally {
    deletingKey.value = ''
  }
}

onMounted(refresh)
</script>

<template>
  <section class="management-page skill-page opencode-management-page">
    <header class="management-page__header">
      <div>
        <span class="management-page__eyebrow">AGENT SKILLS</span>
        <h1>Skill 管理</h1>
        <p>管理 Agent 可调用的技能，支持按全局或工作空间范围安装、查找和删除 Skill。</p>
      </div>
      <div class="opencode-header-actions">
        <button class="management-page__primary" type="button" @click="choosePackage">
          <svg viewBox="0 0 20 20"><path d="M10 13V4M6.5 7.5 10 4l3.5 3.5M4 12v3.5h12V12" /></svg>
          上传技能包
        </button>
        <input ref="fileInput" class="opencode-hidden-file" type="file" accept=".zip,application/zip" @change="onPackageSelected">
      </div>
    </header>

    <div class="skill-summary-grid">
      <article class="skill-summary-card">
        <span>已安装 Skill</span><strong>{{ skills.length }}</strong><small>当前范围可用的 Agent 技能</small>
      </article>
      <article class="skill-summary-card">
        <span>可显式调用</span><strong>{{ slashCount }}</strong><small>支持通过指令主动调用</small>
      </article>
      <article class="skill-summary-card">
        <span>自动调用</span><strong>{{ autoinvokeCount }}</strong><small>允许 Agent 根据任务自动选择</small>
      </article>
    </div>

    <div v-if="error" class="opencode-error-banner">
      <b>Skill 加载失败</b><span>{{ error }}</span><button type="button" @click="refresh">重试</button>
    </div>

    <section class="management-surface">
      <div class="management-surface__head">
        <div><b>Skill 列表</b><span>Agent capabilities</span></div>
        <div class="management-surface__actions opencode-skill-actions">
          <el-select v-model="contextWorkspaceID" class="opencode-context-select" placeholder="默认范围" :disabled="loading">
            <el-option label="默认范围" value="" />
            <el-option
              v-for="workspace in workspaces"
              :key="workspaceId(workspace)"
              :label="workspaceLabel(workspace)"
              :value="workspaceId(workspace)"
            />
          </el-select>
          <el-input v-model="keyword" clearable placeholder="搜索 Skill" class="management-page__search compact" />
          <button type="button" :disabled="loading" @click="refresh">刷新</button>
        </div>
      </div>

      <div class="opencode-skill-list-head">
        <span>Skill</span><span>作用域</span><span>指令调用</span><span>自动调用</span><span>操作</span>
      </div>

      <div v-loading="loading" class="opencode-skill-list">
        <article v-for="skill in filteredSkills" :key="skillKey(skill)" class="opencode-skill-row">
          <span class="opencode-row-icon">
            <svg viewBox="0 0 20 20"><path d="M5 4.5h6l1.5 2H15a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z"/><path d="M7.5 11h5M10 8.5v5"/></svg>
          </span>
          <div class="opencode-row-primary">
            <b>{{ skill.name || skill.id }}</b>
            <small>{{ skill.description || skill.id }}</small>
          </div>
          <span class="opencode-scope-chip">{{ skillScope(skill) }}</span>
          <span>{{ skill.slash ? 'YES' : '—' }}</span>
          <span>{{ skill.autoinvoke ? 'YES' : '—' }}</span>
          <button
            class="opencode-danger-button"
            type="button"
            :disabled="!canDeleteSkill(skill) || deletingKey === skillKey(skill)"
            :title="deleteSkillTitle(skill)"
            @click="removeSkill(skill)"
          >
            <svg viewBox="0 0 20 20"><path d="M5.5 6.5h9M8 6.5V4.5h4v2M7 8.5v6M10 8.5v6M13 8.5v6M6 6.5l.7 10h6.6l.7-10"/></svg>
          </button>
        </article>

        <div v-if="!loading && filteredSkills.length === 0 && !error" class="skill-empty-state">
          <div class="skill-empty-state__icon">
            <svg viewBox="0 0 24 24"><path d="M5 5h7l2 3h5v11H5z"/><path d="M9 13h6M12 10v6"/></svg>
          </div>
          <b>当前范围还没有 Skill</b>
          <p>可以上传包含 SKILL.md 的 ZIP 技能包。Global Skill 对所有工作空间可用；Workspace Skill 仅在所选工作空间内生效。</p>
        </div>
      </div>
    </section>

    <el-dialog v-model="uploadDialog" title="上传 Skill 技能包" width="520px" class="opencode-dialog" destroy-on-close>
      <div class="opencode-upload-form">
        <div class="opencode-package-card">
          <span class="opencode-row-icon"><svg viewBox="0 0 20 20"><path d="M4 5h8l4 4v7H4z"/><path d="M12 5v4h4"/></svg></span>
          <div><b>{{ pendingPackage?.name }}</b><small>{{ pendingPackage ? `${(pendingPackage.size / 1024).toFixed(1)} KB` : '' }}</small></div>
        </div>
        <label>安装范围</label>
        <el-radio-group v-model="uploadScope">
          <el-radio value="global">Global</el-radio>
          <el-radio value="workspace" :disabled="workspaces.length === 0">Workspace</el-radio>
        </el-radio-group>
        <template v-if="uploadScope === 'workspace'">
          <label>工作空间</label>
          <el-select v-model="uploadWorkspaceID" placeholder="选择工作空间" class="opencode-dialog-select">
            <el-option
              v-for="workspace in workspaces"
              :key="workspaceId(workspace)"
              :label="workspaceLabel(workspace)"
              :value="workspaceId(workspace)"
            />
          </el-select>
        </template>
        <el-checkbox v-model="replaceExisting">同名 Skill 已存在时覆盖</el-checkbox>
        <p class="opencode-form-note">ZIP 内必须包含一个完整 Skill。SKILL.md、scripts、references 等技能文件会作为一个整体安装。</p>
      </div>
      <template #footer>
        <button class="opencode-dialog-button" type="button" @click="uploadDialog = false">取消</button>
        <button class="management-page__primary" type="button" :disabled="uploading" @click="installPackage">
          {{ uploading ? '安装中…' : '安装 Skill' }}
        </button>
      </template>
    </el-dialog>
  </section>
</template>
