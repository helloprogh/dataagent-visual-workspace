<script setup lang="ts">
import { computed } from 'vue'
import type { ConversationRecord } from '../conversations/types'

const props = defineProps<{
  conversations: ConversationRecord[]
  activeId: string
  activePage: 'chat' | 'history' | 'skills' | 'workspace'
}>()

const emit = defineEmits<{
  create: []
  select: [id: string]
  rename: [id: string]
  remove: [id: string]
  openHistory: []
  openSkills: []
  openWorkspace: []
}>()

const recentConversations = computed(() => props.conversations.slice(0, 4))

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
        <small>VISUAL WORKSPACE</small>
      </div>
    </header>

    <button class="app-sidebar__new" type="button" @click="emit('create')">
      <span class="app-sidebar__new-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20"><path d="M10 4v12M4 10h12" /></svg>
      </span>
      <div><b>新建会话</b><small>Start a new task</small></div>
    </button>

    <section class="app-sidebar__recent">
      <div class="app-sidebar__section-head app-sidebar__section-head--recent">
        <span>最近会话</span>
        <b>{{ conversations.length }}</b>
      </div>

      <div class="app-sidebar__history app-sidebar__history--compact">
        <article
          v-for="item in recentConversations"
          :key="item.id"
          :class="{ active: item.id === activeId && activePage === 'chat' }"
          @click="emit('select', item.id)"
        >
          <span class="app-sidebar__thread-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20"><path d="M4 5.5h12v8H9l-3.8 2.4V13.5H4z" /></svg>
          </span>
          <div class="app-sidebar__thread-copy">
            <b>{{ item.displayName }}</b>
            <small>{{ timeLabel(item.updatedAt) }} · {{ item.messages.length }} 条消息</small>
          </div>
          <el-dropdown trigger="click" @click.stop>
            <button class="app-sidebar__more" type="button" aria-label="会话操作" @click.stop>
              <svg viewBox="0 0 20 20"><circle cx="4" cy="10" r="1"/><circle cx="10" cy="10" r="1"/><circle cx="16" cy="10" r="1"/></svg>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="emit('rename', item.id)">重命名</el-dropdown-item>
                <el-dropdown-item divided @click="emit('remove', item.id)">删除</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </article>
        <div v-if="recentConversations.length === 0" class="app-sidebar__empty">暂无最近会话</div>
      </div>

      <button class="app-sidebar__view-all" type="button" @click="emit('openHistory')">
        <span>查看更多</span>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 6 6-6 6" /></svg>
      </button>
    </section>

    <nav class="app-sidebar__nav app-sidebar__nav--management" aria-label="OpenCode2 management navigation">
      <button
        type="button"
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
          <small>OpenCode2 skills</small>
        </span>
      </button>

      <button
        type="button"
        :class="{ active: activePage === 'workspace' }"
        @click="emit('openWorkspace')"
      >
        <span class="app-sidebar__nav-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20">
            <rect x="3" y="4" width="14" height="12" rx="2" />
            <path d="M6 8h8M6 12h3M12.5 11l2 2-2 2" />
          </svg>
        </span>
        <span class="app-sidebar__nav-copy">
          <b>工作空间管理</b>
          <small>OpenCode2 workspaces</small>
        </span>
      </button>
    </nav>

    <footer class="app-sidebar__footer">
      <span><i></i> AG-UI CONNECTED</span>
      <small>v5.2</small>
    </footer>
  </aside>
</template>
