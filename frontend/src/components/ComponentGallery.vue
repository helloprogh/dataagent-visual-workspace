<script setup lang="ts">
import { computed } from 'vue'
import type { Interrupt } from '@ag-ui/client'
import { genUIRegistry } from '../genui/registry'
import AguiInterruptCard from './conversation/AguiInterruptCard.vue'
import ReasoningProcessCard from './conversation/ReasoningProcessCard.vue'
import ToolStatus from './genui/ToolStatus.vue'
import WorkspaceToolStatus from './genui/WorkspaceToolStatus.vue'

const fixtures: Record<string, Record<string, unknown>> = {
  'ui.markdown': {
    title: '交付说明',
    content: '# 数据交付结论\n核心口径已经确认，当前进入治理验证阶段。\n\n## 检查项\n- 主数据映射已完成\n- ETL 作业已通过测试\n- 两项业务口径仍待确认',
  },
  'ui.agentGraph': {
    title: '多 Agent 编排',
    orchestrator: { id:'root', name:'Delivery Orchestrator', role:'ORCHESTRATOR', task:'协调分析、开发、治理与交付', status:'running', progress:68, output:'正在协调治理验证' },
    agents: [
      { id:'a1', name:'Specification Agent', role:'SPEC', task:'澄清需求与口径', status:'done', progress:100, durationMs:1320, output:'Specification 已确认' },
      { id:'a2', name:'SQL Agent', role:'DEVELOPMENT', task:'生成并验证查询', status:'running', progress:72, tools:['sql','validate'], output:'正在执行回归验证' },
      { id:'a3', name:'Quality Agent', role:'VALIDATION', task:'执行质量规则', status:'waiting', progress:25, output:'等待上游完成' },
    ],
  },
  'ui.agentTimeline': {
    title:'并行执行时间线', totalMs:7200,
    items:[
      { id:'t1', name:'Specification', startMs:0, durationMs:1800, status:'done', label:'DONE' },
      { id:'t2', name:'SQL 开发', startMs:900, durationMs:3800, status:'running', label:'RUNNING' },
      { id:'t3', name:'治理验证', startMs:4200, durationMs:2200, status:'waiting', label:'WAITING' },
    ],
  },
  'ui.agentActivity': {
    title:'实时活动', items:[
      { time:'14:08:21', agent:'Specification Agent', message:'业务口径已确认并生成 Specification v1.3', status:'success', meta:'DONE' },
      { time:'14:08:25', agent:'SQL Agent', message:'正在执行近 90 天聚合查询', status:'running', meta:'72%' },
      { time:'14:08:29', agent:'Quality Agent', message:'检测到 2 条规则需要人工确认', status:'warning', meta:'2 rules' },
      { time:'14:08:32', agent:'Delivery Agent', message:'交付包生成失败，将自动重试', status:'error', meta:'RETRY' },
    ],
  },
  'ui.executiveSummary': {
    title:'分析结论', summary:'华东区近三个月销售额整体增长，但 8 月第二周出现明显回落，主要来自渠道促销结束与核心 SKU 缺货。', confidence:91,
    tags:['趋势','异常','渠道'], highlights:[
      { label:'销售额', value:'+12.6%', tone:'positive' },
      { label:'异常周', value:'08-10 ~ 08-16', tone:'negative' },
      { label:'置信度', value:'91%', tone:'neutral' },
    ],
  },
  'ui.metric': { title:'销售额', value:'¥ 28.6M', delta:12.6, description:'较上周期提升', unit:'' },
  'ui.kpis': {
    title:'核心指标', items:[
      { label:'销售额', value:'28.6M', unit:'¥', delta:12.6, description:'环比' },
      { label:'订单数', value:18420, unit:'单', delta:8.3, description:'环比' },
      { label:'客单价', value:1552, unit:'¥', delta:-2.1, description:'环比' },
      { label:'复购率', value:38.7, unit:'%', delta:3.4, description:'环比' },
    ],
  },
  'ui.table': {
    title:'销售明细', columns:[{key:'region',label:'区域'},{key:'sales',label:'销售额'},{key:'growth',label:'增长率'},{key:'owner',label:'负责人'}],
    rows:[
      {region:'华东',sales:'¥ 8,920,000',growth:'+18.2%',owner:'Alice'},
      {region:'华南',sales:'¥ 6,480,000',growth:'+9.4%',owner:'Bob'},
      {region:'华北',sales:'¥ 5,760,000',growth:'-3.1%',owner:'Carol'},
      {region:'西部',sales:'¥ 4,230,000',growth:'+6.8%',owner:'David'},
    ],
  },
  'ui.barChart': { title:'区域销售贡献', items:[{label:'华东',value:89},{label:'华南',value:65},{label:'华北',value:58},{label:'西部',value:42}] },
  'ui.lineChart': { title:'近 7 日销售趋势', unit:'万元', points:[{label:'08-15',value:320},{label:'08-16',value:356},{label:'08-17',value:342},{label:'08-18',value:398},{label:'08-19',value:421},{label:'08-20',value:409},{label:'08-21',value:452}] },
  'ui.areaChart': { title:'活跃客户趋势', unit:'人', points:[{label:'Mon',value:1260},{label:'Tue',value:1380},{label:'Wed',value:1325},{label:'Thu',value:1510},{label:'Fri',value:1680},{label:'Sat',value:1590},{label:'Sun',value:1740}] },
  'ui.donutChart': { title:'渠道构成', centerText:'28.6M', items:[{label:'直营',value:42},{label:'经销',value:31},{label:'电商',value:19},{label:'其他',value:8}] },
  'ui.funnel': { title:'客户转化漏斗', unit:'人', stages:[{label:'访问',value:120000,conversion:100},{label:'线索',value:42600,conversion:35.5},{label:'商机',value:13800,conversion:32.4},{label:'成交',value:4860,conversion:35.2}] },
  'ui.heatmap': { title:'星期 / 时段订单热力', unit:'订单', xLabels:['09','12','15','18','21'], yLabels:['周一','周二','周三','周四','周五'], values:[[12,38,52,86,44],[18,42,61,91,57],[15,35,49,78,40],[22,47,68,96,63],[28,55,74,100,71]] },
  'ui.rootCause': { title:'异常归因', target:'销售额下降', factors:[
    {label:'核心 SKU 缺货',contribution:-42,description:'A12 / A18 两个高贡献 SKU 库存不足'},
    {label:'渠道活动结束',contribution:-31,description:'电商大促结束后自然回落'},
    {label:'直营门店增长',contribution:18,description:'新开门店部分抵消下滑'},
  ] },
  'ui.forecast': { title:'未来 7 日预测', metric:'销售额', value:'¥ 3.8M', change:7.2, horizon:'7 DAYS', confidence:88, points:[
    {label:'D1',actual:320},{label:'D2',actual:345},{label:'D3',actual:366,forecast:366},{label:'D4',forecast:382},{label:'D5',forecast:401},{label:'D6',forecast:418},{label:'D7',forecast:432},
  ] },
  'ui.insights': { title:'关键洞察', items:[
    {title:'华东销售继续领先',description:'直营渠道贡献显著提升。',severity:'success',metric:'+18.2%'},
    {title:'SKU A12 缺货风险',description:'预计影响本周销售约 42 万。',severity:'danger',metric:'HIGH'},
    {title:'客户复购率提升',description:'会员触达策略开始生效。',severity:'info',metric:'+3.4%'},
    {title:'两条业务规则待确认',description:'需业务 owner 确认退款订单口径。',severity:'warning',metric:'2'},
  ] },
  'ui.analysisPlan': { title:'分析计划', steps:[
    {title:'需求澄清',description:'确认区域、时间范围与销售口径',status:'done'},
    {title:'数据准备',description:'完成订单、商品、渠道数据关联',status:'done'},
    {title:'异常分析',description:'拆解渠道与 SKU 贡献',status:'running'},
    {title:'结论验证',description:'与业务规则交叉验证',status:'pending'},
    {title:'报告输出',description:'生成可执行建议',status:'error'},
  ] },
  'ui.queryTrace': { title:'Agent 执行链路', durationMs:1382, steps:[
    {title:'识别意图',description:'解析分析目标与过滤条件',status:'done',durationMs:64,kind:'intent'},
    {title:'语义解析',description:'匹配指标、维度和业务口径',status:'done',durationMs:118,kind:'semantic'},
    {title:'SQL 生成',description:'生成聚合查询',status:'done',durationMs:205,kind:'sql'},
    {title:'执行查询',description:'扫描 182 万行数据',status:'running',durationMs:617,kind:'execute'},
    {title:'生成洞察',description:'识别异常与主要贡献因素',status:'pending',durationMs:378,kind:'insight'},
  ] },
  'ui.sql': { title:'生成 SQL', dialect:'Spark SQL', durationMs:842, sql:'SELECT\n  region,\n  SUM(pay_amount) AS sales_amount,\n  COUNT(DISTINCT order_id) AS orders\nFROM dwd_sales_order\nWHERE order_date >= DATE_SUB(CURRENT_DATE, 90)\nGROUP BY region\nORDER BY sales_amount DESC;' },
  'ui.dataQuality': { title:'数据质量评分', score:87, status:'good', dimensions:[{label:'完整性',score:96,note:'空值率 0.8%'},{label:'唯一性',score:89,note:'发现 18 个重复客户编码'},{label:'及时性',score:78,note:'2 张表延迟 15 分钟'}] },
  'ui.fieldProfile': { title:'字段画像', fields:[
    {name:'customer_id',type:'STRING',nullRate:0,distinctCount:482193,sample:'CUST_102834'},
    {name:'pay_amount',type:'DECIMAL(18,2)',nullRate:0.2,distinctCount:86214,sample:'1288.50'},
    {name:'channel_name',type:'STRING',nullRate:1.4,distinctCount:12,sample:'直营门店'},
    {name:'order_time',type:'TIMESTAMP',nullRate:0,distinctCount:1702842,sample:'2026-08-21 13:46:22'},
  ] },
  'ui.semanticModel': { title:'销售主题语义模型', model:'Sales Domain', description:'统一销售分析的维度、度量、业务指标与来源映射。', dimensions:['区域','渠道','客户','商品','日期'], measures:['销售额','订单数','销量'], metrics:['客单价','复购率','转化率'], sources:['dwd_sales_order','dim_customer','dim_product'] },
}

const reasoningMessage = {
  id: 'gallery-reasoning',
  role: 'reasoning',
  content: '正在比较近三个月销售趋势，并进一步拆解渠道、商品与客户结构，以确认异常波动的主要原因。',
} as any

const approvalInterrupt = {
  id: 'gallery-approval',
  reason: 'tool_call',
  message: '需要继续查询订单明细，以确认华东区销售下滑的具体来源。',
  responseSchema: {
    type: 'string',
    oneOf: [
      { const: 'once', title: '允许一次' },
      { const: 'always', title: '始终允许' },
      { const: 'reject', title: '拒绝' },
    ],
  },
  metadata: {
    action: '执行进一步明细查询',
    resources: ['sales_detail'],
  },
} as unknown as Interrupt

const resolveFixture = async () => undefined
const cancelFixture = async () => undefined
const wideComponents = new Set(['ui.markdown','ui.agentGraph','ui.agentTimeline','ui.table','ui.heatmap','ui.queryTrace','ui.semanticModel'])
const componentCount = computed(() => genUIRegistry.length)
</script>

<template>
  <main class="component-gallery dataagent-shell">
    <header class="component-gallery__header">
      <div>
        <span>视觉回归基准</span>
        <h1>Data Agent Visual System</h1>
        <p>真实渲染全部 GenUI 与关键对话、状态和管理元素，用于工业级深色主题的持续视觉检查。</p>
      </div>
      <div class="component-gallery__stats"><b>{{ componentCount }}</b><span>GenUI 组件</span></div>
    </header>

    <section class="component-gallery__section component-gallery__visual-scope visual-workspace">
      <div class="component-gallery__section-head"><div><small>GENERATIVE UI</small><h2>生成式 UI 组件</h2></div><span>{{ componentCount }} / {{ componentCount }} 已渲染</span></div>
      <div class="component-gallery__grid">
        <article v-for="entry in genUIRegistry" :key="entry.name" class="component-gallery__item" :class="{ wide: wideComponents.has(entry.name) }">
          <div class="component-gallery__label"><div><code>{{ entry.name }}</code><b>{{ entry.title }}</b></div><span>{{ entry.description }}</span></div>
          <div class="widget-frame component-gallery__frame">
            <component :is="entry.component" v-bind="fixtures[entry.name] || {}" />
          </div>
        </article>
      </div>
    </section>

    <section class="component-gallery__section component-gallery__conversation conversation-chat visual-chat">
      <div class="component-gallery__section-head"><div><small>CONVERSATION</small><h2>对话与运行状态</h2></div><span>真实状态组件 + 产品主题 Markdown</span></div>
      <div class="component-gallery__system-grid">
        <article class="component-gallery__system-card wide">
          <div class="component-gallery__label"><b>Assistant Markdown</b><span>标题 / 正文 / 链接 / 行内代码 / 列表 / 引用 / 代码块 / 表格</span></div>
          <div data-testid="copilot-chat-assistant-message" class="component-gallery__assistant-message">
            <div class="copilot-chat-assistant-markdown">
              <h2>销售分析结论</h2>
              <p>华东区销售额增长 <strong>18.2%</strong>，主要由直营渠道贡献。这里包含 <a href="#">可点击链接</a> 和行内代码 <code>SUM(pay_amount)</code>。</p>
              <ul><li>核心 SKU A12 出现缺货</li><li>会员复购率提升 3.4%</li></ul>
              <blockquote><p>需要业务确认退款后恢复订单是否计入有效订单。</p></blockquote>
              <pre><code>SELECT region, SUM(pay_amount)\nFROM sales\nGROUP BY region;</code></pre>
              <table><thead><tr><th>区域</th><th>销售额</th><th>增长</th></tr></thead><tbody><tr><td>华东</td><td>8.92M</td><td>+18.2%</td></tr><tr><td>华北</td><td>5.76M</td><td>-3.1%</td></tr></tbody></table>
            </div>
          </div>
        </article>

        <article class="component-gallery__system-card">
          <div class="component-gallery__label"><b>思考过程</b><span>真实 ReasoningProcessCard · 生成中</span></div>
          <ReasoningProcessCard :message="reasoningMessage" :messages="[reasoningMessage]" :is-running="true" />
        </article>

        <article class="component-gallery__system-card">
          <div class="component-gallery__label"><b>工具执行</b><span>完成 / 执行中</span></div>
          <ToolStatus name="query_sales_data" status="complete" :parameters="{ command:'spark-sql --file analysis.sql', region:'华东', days:90 }" :result="{ rows: 1284, elapsedMs: 842, status: 'success' }" />
          <ToolStatus name="profile_customer_dimension" status="executing" :parameters="{ table:'dim_customer' }" />
        </article>

        <article class="component-gallery__system-card">
          <div class="component-gallery__label"><b>工作区更新</b><span>真实 WorkspaceToolStatus</span></div>
          <WorkspaceToolStatus name="workspace.render" status="complete" tool-call-id="gallery-workspace" :parameters="{}" result="ok" />
        </article>

        <article class="component-gallery__system-card wide">
          <div class="component-gallery__label"><b>操作确认</b><span>真实 AguiInterruptCard · schema 驱动选项</span></div>
          <AguiInterruptCard :interrupt="approvalInterrupt" :interrupts="[approvalInterrupt]" :resolve="resolveFixture" :cancel="cancelFixture" />
        </article>

        <article class="component-gallery__system-card">
          <div class="component-gallery__label"><b>附件</b><span>文档附件的正常状态</span></div>
          <div class="component-gallery__attachment">
            <span class="component-gallery__file-mark">PDF</span>
            <div><b>sales-analysis-2026Q3.pdf</b><small>2.8 MB · 已上传</small></div>
            <button type="button" aria-label="移除附件">×</button>
          </div>
        </article>

        <article class="component-gallery__system-card">
          <div class="component-gallery__label"><b>Composer</b><span>输入 / 上传 / 模型 / 发送</span></div>
          <div class="component-gallery__composer-preview">
            <textarea readonly>请分析华东区最近三个月销售变化</textarea>
            <div class="component-gallery__composer-actions"><button type="button">＋</button><span>GPT-5.6 Sol</span><button type="button" class="primary">↑</button></div>
          </div>
        </article>

        <article class="component-gallery__system-card">
          <div class="component-gallery__label"><b>User Message</b><span>用户消息 surface</span></div>
          <div data-testid="copilot-chat-user-message" class="component-gallery__user-message">分析一下华东区最近三个月销售变化，并给出异常原因。</div>
        </article>
      </div>
    </section>

    <section class="component-gallery__section">
      <div class="component-gallery__section-head"><div><small>MANAGEMENT / SYSTEM</small><h2>管理与系统状态</h2></div><span>按钮 / 状态 / 错误 / 列表 / 空状态 / 浮层</span></div>
      <div class="component-gallery__system-grid">
        <article class="component-gallery__system-card">
          <div class="component-gallery__label"><b>操作与状态</b><span>Primary / Connected / Disconnected</span></div>
          <div class="component-gallery__primitive-row">
            <button class="management-page__primary" type="button">新建工作空间</button>
            <span class="management-page__status-chip connected"><i></i>服务可用</span>
            <span class="management-page__status-chip disconnected"><i></i>服务不可用</span>
          </div>
        </article>

        <article class="component-gallery__system-card">
          <div class="component-gallery__label"><b>错误提示</b><span>可恢复的系统错误</span></div>
          <div class="opencode-error-banner component-gallery__error"><b>加载失败</b><span>暂时无法获取工作空间列表，请稍后重试。</span><button type="button">重试</button></div>
        </article>

        <article class="component-gallery__system-card wide">
          <div class="component-gallery__label"><b>历史记录</b><span>表头 / 普通行 / 当前行 / 更多操作</span></div>
          <div class="history-table component-gallery__history">
            <div class="history-table__head"><span>会话</span><span>消息</span><span>更新时间</span><span></span></div>
            <div class="history-table__row active"><div class="history-table__title"><span class="history-table__icon">◌</span><div><b>分析本月销售异常原因</b><small>thread-a8d24f...</small></div></div><span>18</span><span>19:22</span><button class="history-table__more">•••</button></div>
            <div class="history-table__row"><div class="history-table__title"><span class="history-table__icon">◌</span><div><b>用户留存趋势分析</b><small>thread-c2137e...</small></div></div><span>12</span><span>17:08</span><button class="history-table__more">•••</button></div>
          </div>
        </article>

        <article class="component-gallery__system-card">
          <div class="component-gallery__label"><b>空状态</b><span>无匹配数据 / 未安装能力</span></div>
          <div class="skill-empty-state component-gallery__empty"><span class="skill-empty-state__icon">◇</span><b>暂未安装技能</b><p>安装技能后，可以为数据开发和分析任务扩展更多专业能力。</p></div>
        </article>

        <article class="component-gallery__system-card">
          <div class="component-gallery__label"><b>浮层层级</b><span>Dialog / form surface</span></div>
          <div class="component-gallery__dialog"><header><b>新建工作空间</b><button type="button">×</button></header><div><label>工作空间名称</label><div class="component-gallery__input">sales-analysis-prod</div><label>关联项目</label><div class="component-gallery__input">Data Platform</div></div><footer><button type="button">取消</button><button type="button" class="primary">创建</button></footer></div>
        </article>
      </div>
    </section>
  </main>
</template>

<style scoped>
.component-gallery{height:100vh;display:block;overflow:auto;padding:0 28px 64px;background:var(--da-surface-0);color:var(--da-text-primary)}
.component-gallery__header{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:24px;margin:0 -28px 26px;padding:20px 30px;border-bottom:1px solid var(--da-border);background:color-mix(in srgb,var(--da-surface-0) 94%,transparent);backdrop-filter:blur(18px)}
.component-gallery__header>div:first-child>span,.component-gallery__section-head small{color:var(--da-text-subtle);font-size:11px;font-weight:620;letter-spacing:.06em}
.component-gallery__header h1{margin:4px 0 5px;color:var(--da-text-emphasis);font-size:27px;line-height:1.2;font-weight:650;letter-spacing:-.025em}
.component-gallery__header p{margin:0;color:var(--da-text-muted);font-size:13px;line-height:1.6}
.component-gallery__stats{min-width:128px;padding:9px 13px;border:1px solid var(--da-border);border-radius:10px;background:var(--da-surface-1);text-align:right}
.component-gallery__stats b{display:block;color:var(--da-text-emphasis);font-size:23px;font-weight:650}.component-gallery__stats span{color:var(--da-text-muted);font-size:11px}
.component-gallery__section{height:auto!important;min-height:0!important;display:block!important;overflow:visible!important;border:0!important;background:transparent!important;margin:0 auto 32px;max-width:1680px}
.component-gallery__section-head{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;margin:0 0 14px;padding:0 2px}.component-gallery__section-head h2{margin:3px 0 0;color:var(--da-text-emphasis);font-size:19px;font-weight:640}.component-gallery__section-head>span{color:var(--da-text-muted);font-size:11px}
.component-gallery__grid,.component-gallery__system-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.component-gallery__item,.component-gallery__system-card{min-width:0;padding:11px;border:1px solid rgba(183,196,210,.09);border-radius:13px;background:rgba(255,255,255,.006)}
.component-gallery__item.wide,.component-gallery__system-card.wide{grid-column:1/-1}
.component-gallery__label{min-height:46px;display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:2px 2px 9px}.component-gallery__label>div{display:flex;align-items:center;gap:9px}.component-gallery__label code{color:var(--da-link);font-size:11px}.component-gallery__label b{color:var(--da-text-primary);font-size:12px;font-weight:620}.component-gallery__label span{max-width:58%;color:var(--da-text-muted);font-size:11px;line-height:1.45;text-align:right}.component-gallery__frame{min-height:220px}
.component-gallery__assistant-message{max-width:900px;padding:3px 2px 6px;background:transparent}
.component-gallery__attachment{min-height:58px;display:grid;grid-template-columns:36px minmax(0,1fr) 26px;align-items:center;gap:10px;padding:9px 10px;border:1px solid var(--da-border);border-radius:10px;background:var(--da-surface-2)}.component-gallery__file-mark{width:34px;height:34px;display:grid;place-items:center;border:1px solid rgba(139,159,210,.14);border-radius:9px;color:var(--da-text-secondary);background:rgba(139,159,210,.035);font-size:10px;font-weight:700}.component-gallery__attachment>div{min-width:0}.component-gallery__attachment b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--da-text-primary);font-size:12px}.component-gallery__attachment small{display:block;margin-top:3px;color:var(--da-text-muted);font-size:11px}.component-gallery__attachment button{width:26px;height:26px;border:0;border-radius:7px;background:transparent;color:var(--da-text-muted)}
.component-gallery__composer-preview{min-height:108px;padding:11px;border:1px solid var(--da-border);border-radius:13px;background:var(--da-surface-input)}.component-gallery__composer-preview textarea{width:100%;min-height:48px;padding:0;border:0;resize:none;outline:0;background:transparent;color:var(--da-text-primary);font:14px/1.58 inherit}.component-gallery__composer-actions{display:flex;align-items:center;gap:8px;margin-top:8px}.component-gallery__composer-actions span{margin-left:auto;padding:7px 9px;border:1px solid rgba(183,196,210,.10);border-radius:8px;color:var(--da-text-secondary);font-size:11px}.component-gallery__composer-actions button{width:32px;height:32px;border:1px solid rgba(183,196,210,.10);border-radius:8px;background:transparent;color:var(--da-text-secondary)}.component-gallery__composer-actions button.primary{border-color:transparent;border-radius:50%;background:#788DBB;color:#0A1118}
.component-gallery__user-message{margin-left:auto;max-width:72%;padding:11px 13px;line-height:1.6}
.component-gallery__primitive-row{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:4px 0 8px}.component-gallery__error{margin:0;max-width:none}.component-gallery__history{margin:0;max-width:none}.component-gallery__empty{min-height:230px;padding:28px}.component-gallery__dialog{overflow:hidden;border:1px solid var(--da-border-strong);border-radius:14px;background:var(--da-surface-2);box-shadow:var(--da-shadow-raised)}.component-gallery__dialog header,.component-gallery__dialog footer{display:flex;align-items:center;justify-content:space-between;padding:13px 15px;border-bottom:1px solid var(--da-border)}.component-gallery__dialog header b{color:var(--da-text-emphasis);font-size:15px}.component-gallery__dialog header button{border:0;background:transparent;color:var(--da-text-muted)}.component-gallery__dialog>div{display:flex;flex-direction:column;gap:7px;padding:15px}.component-gallery__dialog label{margin-top:4px;color:var(--da-text-secondary);font-size:12px}.component-gallery__input{min-height:38px;padding:0 10px;display:flex;align-items:center;border:1px solid var(--da-border);border-radius:9px;background:var(--da-surface-input);color:var(--da-text-primary);font-size:12px}.component-gallery__dialog footer{justify-content:flex-end;gap:8px;border-top:1px solid var(--da-border);border-bottom:0}.component-gallery__dialog footer button{min-height:34px;padding:0 11px;border:1px solid var(--da-border);border-radius:8px;background:transparent;color:var(--da-text-secondary)}.component-gallery__dialog footer button.primary{border-color:#788DBB;background:#788DBB;color:#0A1118}
@media(max-width:1000px){.component-gallery__grid,.component-gallery__system-grid{grid-template-columns:1fr}.component-gallery__item.wide,.component-gallery__system-card.wide{grid-column:auto}.component-gallery__header{align-items:flex-start}.component-gallery__stats{display:none}}
@media(max-width:640px){.component-gallery{padding:0 12px 40px}.component-gallery__header{margin:0 -12px 20px;padding:16px}.component-gallery__label{display:block}.component-gallery__label span{display:block;max-width:none;margin-top:6px;text-align:left}}
</style>
