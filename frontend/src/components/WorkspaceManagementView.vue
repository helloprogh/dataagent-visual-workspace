<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createOpenCodeWorkspace,
  deleteOpenCodeWorkspace,
  getOpenCodeDiagnostics,
  listOpenCodeProjects,
  listOpenCodeWorkspaces,
  projectId,
  workspaceDirectory,
  workspaceId,
  type OpenCodeDiagnostics,
  type OpenCodeProject,
  type OpenCodeWorkspace,
} from '../opencode/management'

const diagnostics = ref<OpenCodeDiagnostics>({ connected: false })
const workspaces = ref<OpenCodeWorkspace[]>([])
const projects = ref<OpenCodeProject[]>([])
const keyword = ref('')
const loading = ref(false)
const error = ref('')
const createDialog = ref(false)
const creating = ref(false)
const form = reactive({
  name: '',
  projectID: '',
  directory: '',
  type: 'worktree',
})

const filteredWorkspaces = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return workspaces.value
  return workspaces.value.filter(workspace => [
    workspaceId(workspace),
    workspace.name,
    workspaceDirectory(workspace),
    workspace.projectID,
    workspace.type,
  ].some(value => String(value ?? '').toLowerCase().includes(q)))
})

const activeCount = computed(() => workspaces.value.filter(workspace => !workspace.archived).length)

function projectLabel(project: OpenCodeProject) {
  return project.name || project.worktree || project.directory || projectId(project)
}

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    diagnostics.value = await getOpenCodeDiagnostics()
    if (!diagnostics.value.connected) {
      workspaces.value = []
      projects.value = []
      error.value = '工作空间服务暂不可用，请稍后重试。'
      return
    }
    const [workspaceData, projectData] = await Promise.all([
      listOpenCodeWorkspaces(),
      listOpenCodeProjects().catch(() => []),
    ])
    workspaces.value = workspaceData
    projects.value = projectData
  } catch (cause) {
    console.error('[workspace-management] load failed', cause)
    error.value = '工作空间数据加载失败，请稍后重试。'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  form.name = ''
  form.projectID = ''
  form.directory = ''
  form.type = 'worktree'
  createDialog.value = true
}

async function createWorkspace() {
  if (!form.type.trim()) {
    ElMessage.warning('工作空间类型不能为空')
    return
  }
  creating.value = true
  try {
    await createOpenCodeWorkspace({
      type: form.type.trim(),
      ...(form.name.trim() ? { name: form.name.trim() } : {}),
      ...(form.projectID ? { projectID: form.projectID } : {}),
      ...(form.directory.trim() ? { directory: form.directory.trim() } : {}),
    })
    createDialog.value = false
    await refresh()
    ElMessage.success('工作空间已创建')
  } catch (cause) {
    console.error('[workspace-management] create failed', cause)
    ElMessage.error('工作空间创建失败，请检查配置后重试。')
  } finally {
    creating.value = false
  }
}

async function removeWorkspace(workspace: OpenCodeWorkspace) {
  const id = workspaceId(workspace)
  if (!id) return
  try {
    await ElMessageBox.confirm(
      `将删除工作空间「${workspace.name || id}」的注册信息。此操作不会删除聊天记录，是否继续？`,
      '删除工作空间',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
    await deleteOpenCodeWorkspace(id)
    await refresh()
    ElMessage.success('工作空间已删除')
  } catch (cause) {
    if (cause instanceof Error) {
      console.error('[workspace-management] delete failed', cause)
      ElMessage.error('工作空间删除失败，请刷新后重试。')
    }
  }
}

onMounted(refresh)
</script>

<template>
  <section class="management-page workspace-management-page opencode-management-page">
    <header class="management-page__header">
      <div>
        <span class="management-page__eyebrow">运行空间</span>
        <h1>工作空间管理</h1>
        <p>管理任务可使用的项目目录、运行上下文和相关资源隔离空间。</p>
      </div>
      <div class="opencode-header-actions">
        <div class="management-page__status-chip" :class="diagnostics.connected ? 'connected' : 'disconnected'">
          <i></i>
          {{ diagnostics.connected ? '服务可用' : '服务不可用' }}
        </div>
        <button class="management-page__primary" type="button" :disabled="!diagnostics.connected" @click="openCreate">
          <svg viewBox="0 0 20 20"><path d="M10 4v12M4 10h12" /></svg>
          新建工作空间
        </button>
      </div>
    </header>

    <div class="workspace-summary-grid">
      <article>
        <span>工作空间总数</span><strong>{{ workspaces.length }}</strong><small>当前已注册的运行空间</small>
      </article>
      <article>
        <span>当前可用</span><strong>{{ activeCount }}</strong><small>可以用于任务执行的工作空间</small>
      </article>
      <article>
        <span>关联项目</span><strong>{{ projects.length }}</strong><small>创建工作空间时可选择的项目</small>
      </article>
    </div>

    <div v-if="error" class="opencode-error-banner">
      <b>工作空间加载失败</b><span>{{ error }}</span><button type="button" @click="refresh">重试</button>
    </div>

    <section class="management-surface">
      <div class="management-surface__head">
        <div><b>工作空间列表</b><span>共 {{ workspaces.length }} 项</span></div>
        <div class="management-surface__actions">
          <el-input v-model="keyword" clearable placeholder="搜索工作空间" class="management-page__search compact" />
          <button type="button" :disabled="loading" @click="refresh">刷新</button>
        </div>
      </div>

      <div class="opencode-workspace-list-head">
        <span>工作空间</span><span>类型</span><span>项目</span><span>目录</span><span>状态</span><span></span>
      </div>

      <div v-loading="loading" class="opencode-workspace-list">
        <article v-for="workspace in filteredWorkspaces" :key="workspaceId(workspace)" class="opencode-workspace-row">
          <span class="opencode-row-icon workspace-icon">
            <svg viewBox="0 0 20 20"><rect x="3" y="4" width="14" height="12" rx="2"/><path d="M6 8h8M6 12h3M12.5 11l2 2-2 2"/></svg>
          </span>
          <div class="opencode-row-primary">
            <b>{{ workspace.name || workspaceId(workspace) || '工作空间' }}</b>
            <small>{{ workspaceId(workspace) }}</small>
          </div>
          <span class="opencode-scope-chip">{{ workspace.type || 'workspace' }}</span>
          <code>{{ workspace.projectID || '—' }}</code>
          <code>{{ workspaceDirectory(workspace) || '—' }}</code>
          <span class="opencode-workspace-status" :class="{ archived: workspace.archived }"><i></i>{{ workspace.archived ? '已归档' : '可用' }}</span>
          <button class="opencode-danger-button" type="button" title="删除工作空间" aria-label="删除工作空间" @click="removeWorkspace(workspace)">
            <svg viewBox="0 0 20 20"><path d="M6 6v9M10 6v9M14 6v9M4 4h12M7 4l1-2h4l1 2M5 4l1 14h8l1-14"/></svg>
          </button>
        </article>

        <div v-if="!loading && filteredWorkspaces.length === 0 && !error" class="workspace-empty-state">
          <div class="workspace-empty-state__icon">
            <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h10M7 14h5"/></svg>
          </div>
          <b>当前还没有工作空间</b>
          <p>点击“新建工作空间”注册一个工作目录，后续任务可以在对应空间中运行。</p>
        </div>
      </div>
    </section>

    <el-dialog v-model="createDialog" title="新建工作空间" width="540px" class="opencode-dialog" destroy-on-close>
      <div class="opencode-upload-form">
        <label>名称 <small>可选</small></label>
        <el-input v-model="form.name" placeholder="例如 dataagent-dev" />
        <label>关联项目 <small>可选</small></label>
        <el-select v-model="form.projectID" clearable placeholder="不绑定项目" class="opencode-dialog-select">
          <el-option label="不绑定项目" value="" />
          <el-option v-for="project in projects" :key="projectId(project)" :label="projectLabel(project)" :value="projectId(project)" />
        </el-select>
        <label>目录 <small>可选；用于注册已有目录</small></label>
        <el-input v-model="form.directory" placeholder="D:\\ProjectSpace\\my-project 或 /repo/app" />
        <label>工作空间类型</label>
        <el-select v-model="form.type" filterable allow-create default-first-option class="opencode-dialog-select">
          <el-option label="worktree" value="worktree" />
        </el-select>
        <p class="opencode-form-note">工作空间用于隔离项目目录和运行上下文。创建完成后，可在技能管理等功能中选择对应工作空间。</p>
      </div>
      <template #footer>
        <button class="opencode-dialog-button" type="button" @click="createDialog = false">取消</button>
        <button class="management-page__primary" type="button" :disabled="creating" @click="createWorkspace">
          {{ creating ? '创建中…' : '创建工作空间' }}
        </button>
      </template>
    </el-dialog>
  </section>
</template>