<script setup lang="ts">
import { watchEffect } from 'vue'
import { workspaceController } from '../../workspace/store'
import type { WorkspaceWidget } from '../../workspace/types'

const props = defineProps<{ widget?: WorkspaceWidget; status?: 'inProgress' | 'executing' | 'complete' }>()
let signature = ''
watchEffect(() => {
  if (!props.widget?.id || !props.widget.component) return
  const next = JSON.stringify(props.widget)
  if (next === signature) return
  signature = next
  workspaceController.upsert(props.widget)
})
</script>

<template>
  <div class="workspace-command-status compact">
    <span class="workspace-command-icon">＋</span>
    <div><b>模块已更新</b><small>{{ widget?.component || 'workspace' }}</small></div>
  </div>
</template>
