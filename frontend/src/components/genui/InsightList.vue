<script setup lang="ts">
defineProps<{
  title?: string
  items?: Array<{
    title: string
    description?: string
    severity?: 'info' | 'success' | 'warning' | 'danger'
    metric?: string
  }>
}>()
</script>

<template>
  <div class="gen-card">
    <div class="gen-title">{{ title || '数据洞察' }}</div>
    <div class="insight-list">
      <div v-for="(item, index) in items || []" :key="`${item.title}-${index}`" class="insight-item">
        <span class="insight-index">{{ index + 1 }}</span>
        <div class="insight-body">
          <div class="insight-title-row">
            <b>{{ item.title }}</b>
            <el-tag v-if="item.metric" size="small" effect="plain">{{ item.metric }}</el-tag>
          </div>
          <p v-if="item.description">{{ item.description }}</p>
        </div>
        <span class="severity" :class="item.severity || 'info'"></span>
      </div>
    </div>
  </div>
</template>
