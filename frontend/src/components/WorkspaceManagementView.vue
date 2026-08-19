<script setup lang="ts">
import { computed } from 'vue'
import { workspaceController } from '../workspace/store'

const emit = defineEmits<{
  openChatWorkspace: []
}>()

const document = computed(() => workspaceController.state.document)
const widgets = computed(() => document.value?.widgets ?? [])
const updatedAt = computed(() => {
  const value = document.value?.updatedAt
  if (!value) return '--'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
})
</script>

<template>
  <section class="management-page workspace-management-page">
    <header class="management-page__header">
      <div>
        <span class="management-page__eyebrow">DYNAMIC WORKSPACE</span>
        <h1>工作空间管理</h1>
        <p>查看当前会话生成的动态工作空间与模块状态。</p>
      </div>
      <button
        class="management-page__primary"
        type="button"
        :disabled="widgets.length === 0"
        @click="emit('openChatWorkspace')"
      >
        <svg viewBox="0 0 20 20"><rect x="3" y="3" width="14" height="14" rx="2"/><path d="M3 8h14M8 8v9"/></svg>
        打开动态工作区
      </button>
    </header>

    <div class="workspace-summary-grid">
      <article>
        <span>当前工作空间</span>
        <strong>{{ document?.title || 'Workspace' }}</strong>
        <small>{{ document?.threadId || '未激活会话' }}</small>
      </article>
      <article>
        <span>动态模块</span>
        <strong>{{ widgets.length }}</strong>
        <small>由 Agent 生成并与当前 thread 绑定</small>
      </article>
      <article>
        <span>最后更新</span>
        <strong class="workspace-summary-time">{{ updatedAt }}</strong>
        <small>{{ widgets.length ? 'Agent driven workspace' : '等待生成动态 UI' }}</small>
      </article>
    </div>

    <section class="management-surface">
      <div class="management-surface__head">
        <div><b>模块清单</b><span>Workspace modules</span></div>
        <span class="management-page__count">{{ widgets.length }} modules</span>
      </div>

      <div v-if="widgets.length" class="workspace-module-list">
        <article v-for="widget in widgets" :key="widget.id" class="workspace-module-row">
          <span class="workspace-module-row__icon">
            <svg viewBox="0 0 20 20"><rect x="3" y="3" width="14" height="14" rx="2"/><path d="M6 7h8M6 10h5M6 13h7"/></svg>
          </span>
          <div>
            <b>{{ widget.component }}</b>
            <small>{{ widget.id }}</small>
          </div>
          <span>跨度 {{ widget.colSpan || 6 }}/12</span>
          <span>{{ widget.minHeight ? `${widget.minHeight}px` : '自动高度' }}</span>
          <span class="workspace-module-row__status"><i></i> READY</span>
        </article>
      </div>

      <div v-else class="workspace-empty-state">
        <div class="workspace-empty-state__icon">
          <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/></svg>
        </div>
        <b>当前会话还没有动态工作空间</b>
        <p>当 Agent 调用 workspace 工具生成第一个模块后，右侧工作区会自动出现，这里也会同步列出全部模块。</p>
      </div>
    </section>
  </section>
</template>
