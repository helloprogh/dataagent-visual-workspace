<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ConversationRecord } from '../conversations/types'

const props = defineProps<{
  conversations: ConversationRecord[]
  activeId: string
  workspaceCount: number
  workspaceVisible: boolean
}>()

const emit = defineEmits<{
  create: []
  select: [id: string]
  rename: [id: string]
  remove: [id: string]
  openWorkspace: []
}>()

type Section = 'history' | 'skills' | 'workspace' | 'plugins'

const activeSection = ref<Section>('history')
const keyword = ref('')
const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  return q
    ? props.conversations.filter(item => item.displayName.toLowerCase().includes(q))
    : props.conversations
})

const navItems: Array<{ id: Section; label: string; subtitle: string; icon: string }> = [
  { id: 'history', label: '历史会话', subtitle: 'Conversation history', icon: 'history' },
  { id: 'skills', label: 'Skill 管理', subtitle: 'Agent capabilities', icon: 'skills' },
  { id: 'workspace', label: '工作空间管理', subtitle: 'Dynamic workspace', icon: 'workspace' },
  { id: 'plugins', label: '插件管理', subtitle: 'Extensions & tools', icon: 'plugins' },
]

function timeLabel(timestamp: number) {
  const date = new Date(timestamp)
  const today = new Date().toDateString() === date.toDateString()
  return new Intl.DateTimeFormat('zh-CN', today
    ? { hour: '2-digit', minute: '2-digit' }
    : { month: '2-digit', day: '2-digit' }).format(date)
}

function selectConversation(id: string) {
  emit('select', id)
  activeSection.value = 'history'
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
      <span>＋</span>
      <div><b>新建会话</b><small>Start a new task</small></div>
    </button>

    <nav class="app-sidebar__nav" aria-label="Data Agent navigation">
      <button
        v-for="item in navItems"
        :key="item.id"
        type="button"
        :class="{ active: activeSection === item.id }"
        @click="activeSection = item.id"
      >
        <span class="app-sidebar__nav-icon" :data-icon="item.icon" aria-hidden="true">
          <svg v-if="item.icon === 'history'" viewBox="0 0 20 20"><path d="M10 4a6 6 0 1 1-5.2 3M3.5 3.5v4h4M10 7v3.5l2.4 1.4" /></svg>
          <svg v-else-if="item.icon === 'skills'" viewBox="0 0 20 20"><path d="M7 3.5h6v4h3.5v5H13v4H7v-4H3.5v-5H7z" /></svg>
          <svg v-else-if="item.icon === 'workspace'" viewBox="0 0 20 20"><rect x="3" y="3" width="14" height="14" rx="2"/><path d="M3 8h14M8 8v9"/></svg>
          <svg v-else viewBox="0 0 20 20"><path d="M7.2 3.5v3M12.8 3.5v3M5.5 6.5h9v3.2a4.5 4.5 0 0 1-4.5 4.5 4.5 4.5 0 0 1-4.5-4.5zM10 14.2v2.3"/></svg>
        </span>
        <span class="app-sidebar__nav-copy">
          <b>{{ item.label }}</b>
          <small>{{ item.subtitle }}</small>
        </span>
        <span v-if="item.id === 'workspace' && workspaceCount" class="app-sidebar__badge">{{ workspaceCount }}</span>
      </button>
    </nav>

    <section class="app-sidebar__content">
      <template v-if="activeSection === 'history'">
        <div class="app-sidebar__section-head">
          <span>RECENT THREADS</span>
          <b>{{ conversations.length }}</b>
        </div>
        <el-input v-model="keyword" clearable placeholder="搜索历史会话" class="app-sidebar__search" />
        <div class="app-sidebar__history">
          <article
            v-for="item in filtered"
            :key="item.id"
            :class="{ active: item.id === activeId }"
            @click="selectConversation(item.id)"
          >
            <span class="app-sidebar__thread-dot"><i></i></span>
            <div class="app-sidebar__thread-copy">
              <b>{{ item.displayName }}</b>
              <small>{{ timeLabel(item.updatedAt) }} · {{ item.messages.length }} 条消息</small>
            </div>
            <el-dropdown trigger="click" @click.stop>
              <button class="app-sidebar__more" type="button" @click.stop>•••</button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="emit('rename', item.id)">重命名</el-dropdown-item>
                  <el-dropdown-item divided @click="emit('remove', item.id)">删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </article>
          <div v-if="filtered.length === 0" class="app-sidebar__empty">没有匹配的会话</div>
        </div>
      </template>

      <template v-else-if="activeSection === 'skills'">
        <div class="app-sidebar__section-head"><span>AGENT SKILLS</span><b>SKILLS</b></div>
        <div class="app-sidebar__management-card">
          <span class="status-dot ready"></span>
          <div><b>Skill 管理</b><p>查看、安装和配置 Data Agent 可调用的能力。</p></div>
        </div>
        <div class="app-sidebar__placeholder">Skill 管理入口已预留，后续接入真实 Skill registry。</div>
      </template>

      <template v-else-if="activeSection === 'workspace'">
        <div class="app-sidebar__section-head"><span>WORKSPACE</span><b>{{ workspaceCount }} MODULES</b></div>
        <div class="app-sidebar__management-card">
          <span class="status-dot" :class="workspaceCount ? 'ready' : 'idle'"></span>
          <div><b>动态工作空间</b><p>{{ workspaceCount ? `当前有 ${workspaceCount} 个动态模块。` : '当前没有需要展示的动态模块。' }}</p></div>
        </div>
        <button
          v-if="workspaceCount && !workspaceVisible"
          class="app-sidebar__secondary-action"
          type="button"
          @click="emit('openWorkspace')"
        >
          打开动态工作空间
        </button>
      </template>

      <template v-else>
        <div class="app-sidebar__section-head"><span>EXTENSIONS</span><b>PLUGINS</b></div>
        <div class="app-sidebar__management-card">
          <span class="status-dot idle"></span>
          <div><b>插件管理</b><p>管理外部工具、数据源和服务扩展。</p></div>
        </div>
        <div class="app-sidebar__placeholder">插件管理入口已预留，后续接入真实插件目录和连接状态。</div>
      </template>
    </section>

    <footer class="app-sidebar__footer">
      <span><i></i> AG-UI CONNECTED</span>
      <small>v5.2</small>
    </footer>
  </aside>
</template>
