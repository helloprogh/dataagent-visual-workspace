import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: to => ({ name: 'chat', query: to.query }),
  },
  {
    path: '/chat',
    name: 'chat',
    component: () => import('../features/conversation/components/AgentChat.vue'),
    meta: { page: 'chat' },
  },
  {
    path: '/history',
    name: 'history',
    component: () => import('../features/conversation/pages/HistoryPage.vue'),
    meta: { page: 'history' },
  },
  {
    path: '/skills',
    name: 'skills',
    component: () => import('../features/skill/pages/SkillPage.vue'),
    meta: { page: 'skills' },
  },
  {
    path: '/tools',
    name: 'tools',
    component: () => import('../features/tool/pages/ToolPage.vue'),
    meta: { page: 'tools' },
  },
  { path: '/:pathMatch(.*)*', redirect: { name: 'chat' } },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})
