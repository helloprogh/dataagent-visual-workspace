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
      error.value = diagnostics.value.error || 'OpenCode2 service 未连接'
      return
    }
    const [workspaceData, projectData] = await Promise.all([
      listOpenCodeWorkspaces(),
      listOpenCodeProjects().catch(() => []),
    ])
    workspaces.value = workspaceData
    projects.value = projectData
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
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
    ElMessage.warning('Workspace type 不能为空')
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
    ElMessage.success('OpenCode2 Workspace 已创建/注册')
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : String(cause))
  } finally {
    creating.value = false
  }
}

async function removeWorkspace(workspace: OpenCodeWorkspace) {
  const id = workspaceId(workspace)
  if (!id) return
  try {
    await ElMessageBox.confirm(
      `将从 OpenCode2 删除 Workspace 注册“${workspace.name || id}”。此操作针对 Workspace 生命周期，不是删除聊天记录。`,
      '删除 OpenCode2 Workspace',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
    await deleteOpenCodeWorkspace(id)
    await refresh()
    ElMessage.success('Workspace 已删除')
  } catch (cause) {
    if (cause instanceof Error) ElMessage.error(cause.message)
  }
}

onMounted(refresh)
</script>

<template>
  <section class="management-page workspace-management-page opencode-management-page">
    <header class="management-page__header">
      <div>
        <span class="management-page__eyebrow">OPENCODE2 WORKSPACES</span>
        <h1>工作空间管理</h1>
        <p>管理 OpenCode2 server-scoped Workspace。这里的 Workspace 与右侧动态渲染区是两个独立概念。</p>
      </div>
      <div class="opencode-header-actions">
        <div class="management-page__status-chip" :class="diagnostics.connected ? 'connected' : 'disconnected'">
          <i></i>
          {{ diagnostics.connected ? `OPENCODE2 ${diagnostics.version || 'CONNECTED'}` : 'OPENCODE2 DISCONNECTED' }}
        </div>
        <button class="management-page__primary" type="button" :disabled="!diagnostics.connected" @click="openCreate">
          <svg viewBox="0 0 20 20"><path d="M10 4v12M4 10h12" /></svg>
          新建 Workspace
        </button>
      </div>
    </header>

    <div class="workspace-summary-grid">
      <article>
        <span>Workspace 总数</span><strong>{{ workspaces.length }}</strong><small>GET /api/workspace</small>
      </article>
      <article>
        <span>当前有效</span><strong>{{ activeCount }}</strong><small>未标记 archived 的 Workspace</small>
      </article>
      <article>
        <span>已知 Project</span><strong>{{ projects.length }}</strong><small>用于创建/注册 Workspace 时关联</small>
      </article>
    </div>

    <div v-if="error" class="opencode-error-banner">
      <b>无法读取 OpenCode2 Workspace</b><span>{{ error }}</span><button type="button" @click="refresh">重试</button>
    </div>

    <section class="management-surface">
      <div class="management-surface__head">
        <div><b>OpenCode2 Workspace 列表</b><span>Server-scoped workspace lifecycle</span></div>
        <div class="management-surface__actions">
          <el-input v-model="keyword" clearable placeholder="搜索 Workspace" class="management-page__search compact" />
          <button type="button" :disabled="loading" @click="refresh">刷新</button>
        </div>
      </div>

      <div class="opencode-workspace-list-head">
        <span>Workspace</span><span>类型</span><span>Project</span><span>目录</span><span>状态</span><span></span>
      </div>

      <div v-loading="loading" class="opencode-workspace-list">
        <article v-for="workspace in filteredWorkspaces" :key="workspaceId(workspace)" class="opencode-workspace-row">
          <span class="opencode-row-icon workspace-icon">
            <svg viewBox="0 0 20 20"><rect x="3" y="4" width="14" height="12" rx="2"/><path d="M6 8h8M6 12h3M12.5 11l2 2-2 2"/></svg>
          </span>
          <div class="opencode-row-primary">
            <b>{{ workspace.name || workspaceId(workspace) || 'Workspace' }}</b>
            <small>{{ workspaceId(workspace) }}</small>
          </div>
          <span class="opencode-scope-chip">{{ workspace.type || 'workspace' }}</span>
          <code>{{ workspace.projectID || '—' }}</code>
          <code>{{ workspaceDirectory(workspace) || '—' }}</code>
          <span class="opencode-workspace-status" :class="{ archived: workspace.archived }"><i></i>{{ workspace.archived ? 'ARCHIVED' : 'ACTIVE' }}</span>
          <button class="opencode-danger-button" type="button" title="删除 Workspace" @click="removeWorkspace(workspace)">
            <svg viewBox="0 0 20 20"><path d="M6 6v9M10 6v9M14 6v9M4 4h12M7 4l1-2h4l1 2M5 4l1 14h8l1-14"/></svg>
          </button>
        </article>

        <div v-if="!loading && filteredWorkspaces.length === 0 && !error" class="workspace-empty-state">
          <div class="workspace-empty-state__icon">
            <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h10M7 14h5"/></svg>
          </div>
          <b>当前 OpenCode2 没有已注册 Workspace</b>
          <p>点击“新建 Workspace”注册工作目录。Workspace 由 OpenCode2 server 管理，可用于后续运行时目录与会话上下文。</p>
        </div>
      </div>
    </section>

    <el-dialog v-model="createDialog" title="新建 OpenCode2 Workspace" width="540px" class="opencode-dialog" destroy-on-close>
      <div class="opencode-upload-form">
        <label>名称 <small>可选</small></label>
        <el-input v-model="form.name" placeholder="例如 dataagent-dev" />
        <label>Project <small>可选</small></label>
        <el-select v-model="form.projectID" clearable placeholder="不绑定 Project" class="opencode-dialog-select">
          <el-option label="不绑定 Project" value="" />
          <el-option v-for="project in projects" :key="projectId(project)" :label="projectLabel(project)" :value="projectId(project)" />
        </el-select>
        <label>目录 <small>可选；用于注册已有目录</small></label>
        <el-input v-model="form.directory" placeholder="D:\\ProjectSpace\\my-project 或 /repo/app" />
        <label>Workspace type</label>
        <el-select v-model="form.type" filterable allow-create default-first-option class="opencode-dialog-select">
          <el-option label="worktree" value="worktree" />
        </el-select>
        <p class="opencode-form-note">请求会透传到 OpenCode2 POST /api/workspace；实际 Workspace 创建和生命周期由 OpenCode2 负责。</p>
      </div>
      <template #footer>
        <button class="opencode-dialog-button" type="button" @click="createDialog = false">取消</button>
        <button class="management-page__primary" type="button" :disabled="creating" @click="createWorkspace">
          {{ creating ? '创建中…' : '创建 Workspace' }}
        </button>
      </template>
    </el-dialog>
  </section>
</template>
