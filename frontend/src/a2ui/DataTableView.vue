<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  title?: string
  columns: (string | { key: string; label?: string; title?: string })[]
  rows: (unknown[] | Record<string, unknown>)[]
}>()
const { t } = useI18n()
const page = ref(1)
const pageSize = 50
const columns = computed(() => props.columns.map(column => typeof column === 'string'
  ? { key: column, label: column }
  : { key: column.key, label: column.label ?? column.title ?? column.key }))
const pages = computed(() => Math.max(1, Math.ceil(props.rows.length / pageSize)))
// Normalize only the displayed slice, not every cell on each page change.
const visible = computed(() => props.rows.slice((page.value - 1) * pageSize, page.value * pageSize)
  .map(row => Array.isArray(row) ? row : columns.value.map(column => row[column.key] ?? '')))
watch(() => props.rows, () => { page.value = 1 })
watch(pages, count => { page.value = Math.min(page.value, count) }, { flush: 'sync' })
</script>

<template>
  <section class="a2ui-data-table">
    <div class="a2ui-data-table__scroll">
      <table>
        <caption v-if="title">{{ title }}</caption>
        <thead><tr><th v-for="(column, index) in columns" :key="index" scope="col">{{ column.label }}</th></tr></thead>
        <tbody><tr v-for="(row, index) in visible" :key="(page - 1) * pageSize + index">
          <td v-for="(value, column) in row" :key="column">{{ String(value) }}</td>
        </tr></tbody>
      </table>
    </div>
    <p v-if="!rows.length">{{ t('table.empty') }}</p>
    <nav v-if="pages > 1" :aria-label="t('table.pagination')">
      <button type="button" :disabled="page === 1" @click="page = 1">{{ t('table.first') }}</button>
      <button type="button" :disabled="page === 1" @click="page--">{{ t('table.previous') }}</button>
      <span role="status">{{ t('table.page', { page, pages, count: rows.length }) }}</span>
      <button type="button" :disabled="page === pages" @click="page++">{{ t('table.next') }}</button>
      <button type="button" :disabled="page === pages" @click="page = pages">{{ t('table.last') }}</button>
    </nav>
  </section>
</template>

<style scoped>
.a2ui-data-table { min-width: 0; margin: var(--da-space-2); padding: var(--da-space-3) var(--da-space-4); border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-md); color: var(--da-text-primary); background: var(--da-surface-1); }
.a2ui-data-table__scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
caption { text-align: left; padding-bottom: var(--da-space-2); color: var(--da-text-muted); font-size: var(--da-font-size-sm); }
td, th { padding: var(--da-space-2); border-bottom: 0.0625rem solid var(--da-border); font-size: var(--da-font-size-sm); text-align: left; }
th { color: var(--da-text-muted); background: var(--da-surface-2); }
nav { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: var(--da-space-2); padding-top: var(--da-space-3); font-size: var(--da-font-size-sm); }
button { padding: var(--da-space-1) var(--da-space-2); border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-md); color: var(--da-text-primary); background: var(--da-surface-2); cursor: pointer; }
button:disabled { opacity: 0.5; cursor: default; }
button:focus-visible { outline: var(--da-focus-outline); }
</style>
