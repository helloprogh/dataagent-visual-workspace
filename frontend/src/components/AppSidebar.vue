<script setup lang="ts">
import { computed } from 'vue'
import type { ConversationRecord } from '../conversations/types'
import type { AppTheme } from '../theme'

const props = defineProps<{
  conversations: ConversationRecord[]
  activeId: string
  activePage: 'chat' | 'history' | 'skills' | 'tools'
  theme: AppTheme
}>()

const emit = defineEmits<{
  create: []
  select: [id: string]
  rename: [id: string]
  openHistory: []
  openSkills: []
  openTools: []
  toggleTheme: []
}>()

const recentConversations = computed(() => props.conversations.slice(0, 4))
const themeToggleLabel = computed(() => props.theme === 'dark' ? '切换到浅色模式' : '切换到深色模式')

function timeLabel(timestamp: number) {
  const date = new Date(timestamp)
  const today = new Date().toDateString() === date.toDateString()
  return new Intl.DateTimeFormat('zh-CN', today
    ? { hour: '2-digit', minute: '2-digit' }
    : { month: '2-digit', day: '2-digit' }).format(date)
}
</script>

<template>
  <aside class="app-sidebar">
    <header class="app-sidebar__brand">
      <div class="app-sidebar__mark"><span></span><i></i></div>
      <div>
        <b>Data Agent</b>
        <small>数据智能工作台</small>
      </div>
    </header>

    <button class="app-sidebar__new" type="button" title="新建会话" aria-label="新建会话" @click="emit('create')">
      <span class="app-sidebar__new-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20"><path d="M10 4v12M4 10h12" /></svg>
      </span>
      <div><b>新建会话</b><small>开始新的分析任务</small></div>
    </button>

    <section class="app-sidebar__recent" aria-label="最近会话">
      <div class="app-sidebar__section-head app-sidebar__section-head--recent">
        <span>最近会话</span>
        <b>{{ conversations.length }}</b>
      </div>

      <div class="app-sidebar__history app-sidebar__history--compact">
        <article
          v-for="item in recentConversations"
          :key="item.id"
          role="button"
          tabindex="0"
          :aria-current="item.id === activeId && activePage === 'chat' ? 'page' : undefined"
          :class="{ active: item.id === activeId && activePage === 'chat' }"
          @click="emit('select', item.id)"
          @keydown.enter.prevent="emit('select', item.id)"
          @keydown.space.prevent="emit('select', item.id)"
        >
          <span class="app-sidebar__thread-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20"><path d="M4 5.5h12v8H9l-3.8 2.4V13.5H4z" /></svg>
          </span>
          <div class="app-sidebar__thread-copy">
            <b>{{ item.displayName }}</b>
            <small>{{ timeLabel(item.updatedAt) }}</small>
          </div>
          <el-dropdown trigger="click" @click.stop>
            <button class="app-sidebar__more" type="button" aria-label="会话操作" @click.stop>
              <svg viewBox="0 0 20 20"><circle cx="4" cy="10" r="1"/><circle cx="10" cy="10" r="1"/><circle cx="16" cy="10" r="1"/></svg>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="emit('rename', item.id)">重命名</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </article>
        <div v-if="recentConversations.length === 0" class="app-sidebar__empty">暂无最近会话</div>
      </div>

      <button class="app-sidebar__view-all" type="button" @click="emit('openHistory')">
        <span>查看全部会话</span>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 6 6-6 6" /></svg>
      </button>
    </section>

    <nav class="app-sidebar__nav app-sidebar__nav--management" aria-label="管理功能">
      <button
        type="button"
        title="Skill 管理"
        aria-label="Skill 管理"
        :aria-current="activePage === 'skills' ? 'page' : undefined"
        :class="{ active: activePage === 'skills' }"
        @click="emit('openSkills')"
      >
        <span class="app-sidebar__nav-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20">
            <path d="M5 4.5h6l1.5 2H15a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" />
            <path d="M7.2 11h5.6M10 8.2v5.6" />
          </svg>
        </span>
        <span class="app-sidebar__nav-copy">
          <b>Skill 管理</b>
          <small>管理技能与扩展能力</small>
        </span>
      </button>

      <button
        type="button"
        title="工具"
        aria-label="工具"
        :aria-current="activePage === 'tools' ? 'page' : undefined"
        :class="{ active: activePage === 'tools' }"
        @click="emit('openTools')"
      >
        <span class="app-sidebar__nav-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20">
            <path d="M12.7 4.1a4 4 0 0 0-4.9 4.8L3.5 13.2a2 2 0 0 0 2.8 2.8l4.3-4.3a4 4 0 0 0 4.8-4.9l-2.5 2.5-2.2-.5-.5-2.2z" />
          </svg>
        </span>
        <span class="app-sidebar__nav-copy">
          <b>工具</b>
          <small>查看可用执行能力</small>
        </span>
      </button>
    </nav>

    <footer class="app-sidebar__footer">
      <span><i></i>服务已连接</span>
      <button
        class="app-sidebar__theme-toggle"
        type="button"
        :title="themeToggleLabel"
        :aria-label="themeToggleLabel"
        @click="emit('toggleTheme')"
      >
        <svg v-if="theme === 'dark'" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="3.2" />
          <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4" />
        </svg>
        <svg v-else viewBox="0 0 20 20" aria-hidden="true">
          <path d="M14.8 13.6A6.3 6.3 0 0 1 6.4 5.2 6.4 6.4 0 1 0 14.8 13.6Z" />
        </svg>
        <span>{{ theme === 'dark' ? '浅色' : '深色' }}</span>
      </button>
    </footer>
  </aside>
</template>
