<script setup lang="ts">
defineProps<{
  title?: string
  fields?: Array<{
    name: string
    type: string
    nullRate?: number
    distinctCount?: number
    sample?: string
  }>
}>()
</script>

<template>
  <div class="gen-card">
    <div class="gen-title">{{ title || '字段画像' }}</div>
    <div class="field-profile">
      <div v-for="field in fields || []" :key="field.name" class="field-row">
        <div class="field-main">
          <b>{{ field.name }}</b>
          <el-tag size="small" effect="plain">{{ field.type }}</el-tag>
        </div>
        <div class="field-stats">
          <span v-if="field.nullRate !== undefined">空值 {{ field.nullRate }}%</span>
          <span v-if="field.distinctCount !== undefined">基数 {{ field.distinctCount }}</span>
          <span v-if="field.sample">示例 {{ field.sample }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
