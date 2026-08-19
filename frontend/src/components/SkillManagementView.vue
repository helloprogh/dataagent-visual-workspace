<script setup lang="ts">
const capabilityItems = [
  { title: '已安装 Skill', value: '--', note: '等待 Skill registry 接口' },
  { title: '可用 Skill', value: '--', note: '接入后显示可安装能力' },
  { title: '需要更新', value: '--', note: '接入后显示版本状态' },
]
</script>

<template>
  <section class="management-page skill-page">
    <header class="management-page__header">
      <div>
        <span class="management-page__eyebrow">AGENT CAPABILITIES</span>
        <h1>Skill 管理</h1>
        <p>统一查看、安装、启停和更新 Data Agent 可调用的 Skill。</p>
      </div>
      <div class="management-page__status-chip"><i></i> REGISTRY NOT CONNECTED</div>
    </header>

    <div class="skill-summary-grid">
      <article v-for="item in capabilityItems" :key="item.title" class="skill-summary-card">
        <span>{{ item.title }}</span>
        <strong>{{ item.value }}</strong>
        <small>{{ item.note }}</small>
      </article>
    </div>

    <section class="management-surface">
      <div class="management-surface__head">
        <div><b>Skill 列表</b><span>Installed & available skills</span></div>
        <div class="management-surface__actions">
          <el-input disabled placeholder="搜索 Skill" class="management-page__search compact" />
          <button type="button" disabled>全部</button>
          <button type="button" disabled>已安装</button>
        </div>
      </div>

      <div class="skill-list-head">
        <span>Skill</span><span>来源</span><span>版本</span><span>状态</span><span></span>
      </div>
      <div class="skill-empty-state">
        <div class="skill-empty-state__icon">
          <svg viewBox="0 0 24 24"><path d="M9 4h6v4h4v6h-4v6H9v-6H5V8h4z"/><circle cx="12" cy="11" r="2"/></svg>
        </div>
        <b>尚未接入 Skill Registry</b>
        <p>当前仅完成管理界面和导航结构。接入真实 Skill 数据源后，这里会展示名称、来源、版本、启用状态以及安装/更新操作。</p>
        <span>不会使用静态 Skill 数据冒充真实安装状态</span>
      </div>
    </section>
  </section>
</template>
