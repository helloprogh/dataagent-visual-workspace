<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { MarkdownRenderer } from 'x-markdown-vue'
import { normalizeUiContent, type UiCard } from '../../../../../shared/generative-ui.mjs'
import { appTheme } from '../../../shared/theme/theme'
import type { ConversationFilePreview } from '../types/filePreview'

const props = withDefaults(defineProps<{
  content: unknown
  messageId: string
  pendingInterruptIds?: string[]
  busy?: boolean
}>(), {
  pendingInterruptIds: () => [],
  busy: false,
})
const emit = defineEmits<{
  preview: [file: ConversationFilePreview]
  confirm: [interruptId: string]
}>()
const content = computed(() => normalizeUiContent(props.content))
const expanded = ref(true)
watch(() => props.messageId, () => { expanded.value = true })
const statuses = { generating: '正在生成', ready: '已生成', error: '生成失败', removed: '已移除' }
function preview(card: Extract<UiCard, { kind: 'file' }>) {
  emit('preview', {
    id: `${props.messageId}-${card.id}`,
    name: card.name,
    url: card.url,
    mimeType: card.mimeType,
    ...(card.approvalInterruptId ? { approvalInterruptId: card.approvalInterruptId } : {}),
    ...(card.approvalInterruptId ? { approvalResolved: !props.pendingInterruptIds.includes(card.approvalInterruptId) } : {}),
    category: 'output',
  })
}

function approvalPending(card: Extract<UiCard, { kind: 'file' }>) {
  return Boolean(card.approvalInterruptId && props.pendingInterruptIds.includes(card.approvalInterruptId))
}
</script>

<template>
  <section v-if="!content" class="generated-card generated-card--error" role="status">
    <p>暂时无法展示这份生成结果，卡片数据格式不受支持。</p>
  </section>
  <section v-else-if="content.status !== 'removed'" class="generated-card" :class="`generated-card--${content.status}`" :data-surface-id="content.surfaceId" :aria-busy="content.status === 'generating'">
    <button class="generated-card__header" type="button" :aria-expanded="expanded" @click="expanded = !expanded">
      <span class="generated-card__mark" aria-hidden="true">▦</span>
      <span class="generated-card__heading"><b>{{ content.title }}</b><small v-if="content.summary">{{ content.summary }}</small></span>
      <span class="generated-card__status" role="status"><i></i>{{ statuses[content.status] }}</span>
      <span class="generated-card__chevron" :class="{ expanded }" aria-hidden="true">›</span>
    </button>
    <div v-show="expanded" class="generated-card__body">
      <p v-if="!content.cards.length" class="generated-card__empty">{{ content.status === 'generating' ? '内容生成后会在这里自动更新…' : content.status === 'error' ? '本次未能生成内容，请重试。' : '暂无展示内容' }}</p>
      <section v-for="card in content.cards" :key="card.id" class="generated-card__block">
        <h3 v-if="card.title">{{ card.title }}</h3>
        <p v-if="card.kind === 'text'" class="generated-card__text">{{ card.text }}</p>
        <MarkdownRenderer v-else-if="card.kind === 'markdown'" :markdown="card.text" :sanitize="true" :is-dark="appTheme === 'dark'" :enable-shiki="false" :enable-mermaid="false" />
        <dl v-else-if="card.kind === 'metrics'" class="generated-card__metrics">
          <div v-for="(item, index) in card.items" :key="index"><dt>{{ item.label }}</dt><dd>{{ item.value }}</dd><small v-if="item.detail">{{ item.detail }}</small></div>
        </dl>
        <div v-else-if="card.kind === 'table'" class="generated-card__table" tabindex="0" role="region" :aria-label="card.title || '数据表格'">
          <table><thead><tr><th v-for="column in card.columns" :key="column.key" scope="col">{{ column.label || column.key }}</th></tr></thead>
            <tbody><tr v-for="(row, index) in card.rows" :key="index"><td v-for="column in card.columns" :key="column.key">{{ row[column.key] }}</td></tr></tbody>
          </table>
          <p v-if="!card.rows.length" class="generated-card__empty">暂无数据</p>
        </div>
        <div v-else-if="card.kind === 'file'" class="generated-card__file">
          <button type="button" class="generated-card__file-main" @click="preview(card)">
            <span><b>{{ card.name }}</b><small>{{ card.mimeType }}</small></span>
            <span>查看完整内容 →</span>
          </button>
          <button
            v-if="approvalPending(card)"
            type="button"
            class="generated-card__confirm"
            :disabled="busy"
            @click="emit('confirm', card.approvalInterruptId!)"
          >{{ busy ? '正在继续…' : '确认并继续' }}</button>
          <span v-else-if="card.approvalInterruptId" class="generated-card__resolved">已处理</span>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.generated-card { width: 100%; min-width: 0; overflow: hidden; border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-lg); background: var(--da-surface-1); animation: card-arrive 180ms ease-out; }
.generated-card__header { display: flex; width: 100%; align-items: center; gap: var(--da-space-3); padding: var(--da-space-4); border: 0; color: var(--da-text-primary); background: transparent; text-align: left; cursor: pointer; transition: background-color 160ms ease; }
.generated-card__header:hover { background: var(--da-surface-2); }
.generated-card__header:focus-visible, .generated-card__file button:focus-visible { outline: 0.125rem solid var(--da-accent-blue); outline-offset: -0.125rem; }
.generated-card__mark { display: grid; width: 2rem; height: 2rem; flex: 0 0 auto; place-items: center; border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-sm); color: var(--da-accent-blue); font-size: 1.25rem; }
.generated-card__heading { display: grid; min-width: 0; flex: 1; gap: var(--da-space-1); overflow-wrap: anywhere; }
.generated-card__heading b { font-size: var(--da-font-size-sm); }
.generated-card__heading small, .generated-card__status { color: var(--da-text-muted); font-size: var(--da-font-size-xs); }
.generated-card__status { display: flex; align-items: center; gap: var(--da-space-2); white-space: nowrap; }
.generated-card__status i { width: 0.375rem; height: 0.375rem; border-radius: 50%; background: var(--da-accent-green); }
.generated-card--generating .generated-card__status i { background: var(--da-accent-blue); animation: card-pulse 1.2s ease-in-out infinite; }
.generated-card--error .generated-card__status i { background: var(--da-accent-orange); }
.generated-card__chevron { font-size: 1.25rem; transition: transform 160ms ease; }
.generated-card__chevron.expanded { transform: rotate(90deg); }
.generated-card__body { display: grid; min-width: 0; gap: var(--da-space-4); padding: 0 var(--da-space-4) var(--da-space-4); }
.generated-card__block { min-width: 0; overflow-wrap: anywhere; }
.generated-card__block h3 { margin: 0 0 var(--da-space-3); color: var(--da-text-secondary); font-size: var(--da-font-size-sm); }
.generated-card__text { margin: 0; color: var(--da-text-secondary); font-size: var(--da-font-size-sm); white-space: pre-wrap; line-height: 1.7; }
.generated-card__metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr)); gap: var(--da-space-3); margin: 0; }
.generated-card__metrics > div { padding: var(--da-space-3); border-radius: var(--da-radius-md); background: var(--da-surface-2); }
.generated-card__metrics dt, .generated-card__metrics small { color: var(--da-text-muted); font-size: var(--da-font-size-xs); }
.generated-card__metrics dd { margin: var(--da-space-2) 0; color: var(--da-text-emphasis); font-size: 1.5rem; font-weight: 600; font-variant-numeric: tabular-nums; }
.generated-card__table { max-height: 24rem; overflow: auto; border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-sm); }
.generated-card__table table { width: 100%; border-collapse: collapse; text-align: left; font-size: var(--da-font-size-sm); }
.generated-card__table th, .generated-card__table td { padding: var(--da-space-3); border-bottom: 0.0625rem solid var(--da-border); }
.generated-card__table th { position: sticky; top: 0; color: var(--da-text-secondary); background: var(--da-surface-2); }
.generated-card__table td { color: var(--da-text-muted); }
.generated-card__file { display: flex; width: 100%; align-items: stretch; gap: var(--da-space-2); padding: var(--da-space-2); border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-md); color: var(--da-text-secondary); background: var(--da-surface-2); }
.generated-card__file-main { display: flex; min-width: 0; flex: 1; align-items: center; justify-content: space-between; gap: var(--da-space-3); padding: var(--da-space-2); border: 0; color: inherit; background: transparent; cursor: pointer; text-align: left; }
.generated-card__file-main > span:first-child { display: grid; min-width: 0; gap: var(--da-space-1); }
.generated-card__file-main b { overflow: hidden; color: var(--da-text-emphasis); text-overflow: ellipsis; white-space: nowrap; }
.generated-card__file-main small, .generated-card__file-main > span:last-child { color: var(--da-text-muted); font-size: var(--da-font-size-xs); white-space: nowrap; }
.generated-card__confirm { align-self: center; padding: var(--da-space-2) var(--da-space-3); border: 0.0625rem solid color-mix(in srgb, var(--da-accent-blue) 55%, var(--da-border)); border-radius: var(--da-radius-sm); color: var(--da-text-emphasis); background: color-mix(in srgb, var(--da-accent-blue) 14%, var(--da-surface-1)); cursor: pointer; white-space: nowrap; }
.generated-card__confirm:disabled { cursor: wait; opacity: 0.6; }
.generated-card__resolved { align-self: center; padding: 0 var(--da-space-2); color: var(--da-accent-green); font-size: var(--da-font-size-xs); white-space: nowrap; }
.generated-card__empty, .generated-card--error > p { margin: 0; padding: var(--da-space-3); color: var(--da-text-muted); font-size: var(--da-font-size-sm); }
@keyframes card-arrive { from { opacity: 0; transform: translateY(0.25rem); } to { opacity: 1; transform: translateY(0); } }
@keyframes card-pulse { 50% { opacity: 0.35; } }
@media (max-width: 40rem) { .generated-card__header { gap: var(--da-space-2); } .generated-card__mark { display: none; } .generated-card__file { align-items: stretch; flex-direction: column; } .generated-card__confirm { width: 100%; } }
@media (prefers-reduced-motion: reduce) { .generated-card, .generated-card--generating .generated-card__status i { animation: none; } .generated-card__header, .generated-card__chevron { transition: none; } }
</style>
