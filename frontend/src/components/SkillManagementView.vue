<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  deleteOpenCodeSkill,
  getOpenCodeDiagnostics,
  installOpenCodeSkillPackage,
  listOpenCodeSkills,
  listOpenCodeWorkspaces,
  workspaceDirectory,
  workspaceId,
  type OpenCodeDiagnostics,
  type OpenCodeSkill,
  type OpenCodeWorkspace,
  type SkillInstallScope,
} from '../opencode/management'

const diagnostics = ref<OpenCodeDiagnostics>({ connected: false })
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
  return skills.value.filter(skill => [skill.id, skill.name, skill.description, skill.location]
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
  return 'OpenCode2'
}

function canDeleteSkill(skill: OpenCodeSkill) {
  const location = normalizedLocation(skill)
  if (!location) return false
  if (location.includes('/opencode/skills/')) return true
  if (location.includes('/.opencode/skills/')) return Boolean(contextWorkspaceID.value)
  return false
}

function deleteSkillTitle(skill: OpenCodeSkill) {
  const location = normalizedLocation(skill)
  if (!location) return 'OpenCode2 未返回 Skill 位置，无法安全删除'
  if (location.includes('/.opencode/skills/') && !contextWorkspaceID.value) {
    return '请先选择该 Skill 所属的 OpenCode2 Workspace'
  }
  if (!canDeleteSkill(skill)) return '该 Skill 来源不在 Data Agent 可管理目录中'
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
    diagnostics.value = await getOpenCodeDiagnostics()
    if (!diagnostics.value.connected) {
      skills.value = []
      workspaces.value = []
      error.value = diagnostics.value.error || 'OpenCode2 service 未连接'
      return
    }
    workspaces.value = await listOpenCodeWorkspaces()
    if (contextWorkspaceID.value && !workspaces.value.some(item => workspaceId(item) === contextWorkspaceID.value)) {
      contextWorkspaceID.value = ''
    }
    await loadSkills()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    loading.value = false
  }
}

watch(contextWorkspaceID, async () => {
  if (!diagnostics.value.connected) return
  loading.value = true
  error.value = ''
  try {
    await loadSkills()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
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
    ElMessage.warning('请选择要安装到的 OpenCode2 Workspace')
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
    ElMessage.error(cause instanceof Error ? cause.message : String(cause))
  } finally {
    uploading.value = false
  }
}

async function removeSkill(skill: OpenCodeSkill) {
  if (!canDeleteSkill(skill)) return
  const name = skill.name || skill.id
  try {
    await ElMessageBox.confirm(
      `将删除 Skill「${name}」的整个技能目录。此操作不会只隐藏列表项，是否继续？`,
      '删除 OpenCode2 Skill',
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
    ElMessage.error(cause instanceof Error ? cause.message : String(cause))
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
        <span class="management-page__eyebrow">OPENCODE2 SKILLS</span>
        <h1>Skill 管理</h1>
        <p>管理 OpenCode2 当前可发现的 Skill，并将 ZIP 技能包安装到 Global 或指定 Workspace。</p>
      </div>
      <div class="opencode-header-actions">
        <div class="management-page__status-chip" :class="diagnostics.connected ? 'connected' : 'disconnected'">
          <i></i>
          {{ diagnostics.connected ? `OPENCODE2 ${diagnostics.version || 'CONNECTED'}` : 'OPENCODE2 DISCONNECTED' }}
        </div>
        <button class="management-page__primary" type="button" :disabled="!diagnostics.connected" @click="choosePackage">
          <svg viewBox="0 0 20 20"><path d="M10 13V4M6.5 7.5 10 4l3.5 3.5M4 12v3.5h12V12" /></svg>
          上传技能包
        </button>
        <input ref="fileInput" class="opencode-hidden-file" type="file" accept=".zip,application/zip" @change="onPackageSelected">
      </div>
    </header>

    <div class="skill-summary-grid">
      <article class="skill-summary-card">
        <span>已注册 Skill</span><strong>{{ skills.length }}</strong><small>来自当前 OpenCode2 运行上下文</small>
      </article>
      <article class="skill-summary-card">
        <span>Slash 命令</span><strong>{{ slashCount }}</strong><small>可通过 slash 显式调用</small>
      </article>
      <article class="skill-summary-card">
        <span>自动调用</span><strong>{{ autoinvokeCount }}</strong><small>允许 OpenCode2 自动选择</small>
      </article>
    </div>

    <div v-if="error" class="opencode-error-banner">
      <b>无法读取 OpenCode2 Skill</b><span>{{ error }}</span><button type="button" @click="refresh">重试</button>
    </div>

    <section class="management-surface">
      <div class="management-surface__head">
        <div><b>OpenCode2 Skill 列表</b><span>GET /api/skill</span></div>
        <div class="management-surface__actions opencode-skill-actions">
          <el-select v-model="contextWorkspaceID" class="opencode-context-select" placeholder="默认运行上下文" :disabled="loading || !diagnostics.connected">
            <el-option label="默认运行上下文" value="" />
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
        <span>Skill</span><span>作用域</span><span>Slash</span><span>Auto</span><span>位置</span><span>操作</span>
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
          <code :title="skill.location || ''">{{ skill.location || 'OpenCode2 runtime' }}</code>
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
          <b>当前上下文没有可见 Skill</b>
          <p>可以上传一个包含 SKILL.md 的 ZIP 技能包。Global 安装到 OpenCode2 全局 Skill 目录；Workspace 安装到所选工作空间的 .opencode/skills。</p>
        </div>
      </div>
    </section>

    <el-dialog v-model="uploadDialog" title="上传 OpenCode2 Skill 包" width="520px" class="opencode-dialog" destroy-on-close>
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
          <label>OpenCode2 Workspace</label>
          <el-select v-model="uploadWorkspaceID" placeholder="选择 Workspace" class="opencode-dialog-select">
            <el-option
              v-for="workspace in workspaces"
              :key="workspaceId(workspace)"
              :label="workspaceLabel(workspace)"
              :value="workspaceId(workspace)"
            />
          </el-select>
        </template>
        <el-checkbox v-model="replaceExisting">同名 Skill 已存在时覆盖</el-checkbox>
        <p class="opencode-form-note">ZIP 内必须包含且仅包含一个 Skill 根目录（或根级 SKILL.md）；scripts、references 等附属文件会随包一起安装。</p>
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
