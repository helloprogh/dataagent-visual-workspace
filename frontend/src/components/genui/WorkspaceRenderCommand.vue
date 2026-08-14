<script setup lang="ts">
import { watchEffect } from 'vue'
import { workspaceController } from '../../workspace/store'
import type { WorkspaceWidget } from '../../workspace/types'

const props = defineProps<{
  title?: string
  subtitle?: string
  widgets?: WorkspaceWidget[]
  status?: 'inProgress' | 'executing' | 'complete'
}>()

let signature = ''
watchEffect(() => {
  if (!Array.isArray(props.widgets)) return
  const next = JSON.stringify({ title: props.title, subtitle: props.subtitle, widgets: props.widgets })
  if (next === signature) return
  signature = next
  workspaceController.replace({ title: props.title, subtitle: props.subtitle, widgets: props.widgets })
})
</script>

<template>
  <div class="workspace-command-status">
    <span class="workspace-command-icon">⌁</span>
    <div><b>分析工作区已重构</b><small>{{ widgets?.length || 0 }} 个智能模块</small></div>
  </div>
</template>
