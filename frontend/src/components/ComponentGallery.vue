<script setup lang="ts">
import { computed } from 'vue'
import { genUIRegistry } from '../genui/registry'
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

const wideComponents = new Set(['ui.markdown','ui.agentGraph','ui.agentTimeline','ui.table','ui.heatmap','ui.queryTrace','ui.semanticModel'])
const componentCount = computed(() => genUIRegistry.length)
</script>

<template>
  <main class="component-gallery dataagent-shell">
    <header class="component-gallery__header">
      <div>
        <span>VISUAL REGRESSION / MOCK</span>
        <h1>All Components Gallery</h1>
        <p>真实渲染全部 GenUI 组件与关键 Conversation/System 状态，用于深色主题对比度与层级回归检查。</p>
      </div>
      <div class="component-gallery__stats"><b>{{ componentCount }}</b><span>GenUI components</span></div>
    </header>

    <section class="component-gallery__section component-gallery__visual-scope visual-workspace">
      <div class="component-gallery__section-head"><div><small>GENUI REGISTRY</small><h2>生成式 UI 组件</h2></div><span>{{ componentCount }} / {{ componentCount }} rendered</span></div>
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
      <div class="component-gallery__section-head"><div><small>CONVERSATION / SYSTEM</small><h2>聊天与运行状态</h2></div><span>production class fixtures + real status components</span></div>
      <div class="component-gallery__system-grid">
        <article class="component-gallery__system-card wide">
          <div class="component-gallery__label"><b>Copilot assistant Markdown</b><span>.copilot-chat-assistant-markdown</span></div>
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
          <div class="component-gallery__label"><b>Reasoning</b><span>expanded / streaming fixture</span></div>
          <div class="reasoning-card is-streaming">
            <button class="reasoning-card__header can-expand" type="button"><span class="reasoning-card__icon"><i></i><i></i><i></i></span><span class="reasoning-card__heading"><small>AG-UI REASONING</small><b>思考过程</b></span><span class="reasoning-card__status active"><i></i>生成中</span><span class="reasoning-card__chevron open">›</span></button>
            <div class="component-gallery__reasoning-body">正在比较近三个月销售趋势，并进一步拆解渠道、商品与客户结构，以确认异常波动的主要原因。</div>
          </div>
        </article>

        <article class="component-gallery__system-card">
          <div class="component-gallery__label"><b>Tool execution</b><span>real ToolStatus component</span></div>
          <ToolStatus name="query_sales_data" status="complete" :parameters="{ command:'spark-sql --file analysis.sql', region:'华东', days:90 }" :result="{ rows: 1284, elapsedMs: 842, status: 'success' }" />
          <ToolStatus name="profile_customer_dimension" status="executing" :parameters="{ table:'dim_customer' }" />
        </article>

        <article class="component-gallery__system-card">
          <div class="component-gallery__label"><b>Workspace tool</b><span>real WorkspaceToolStatus component</span></div>
          <WorkspaceToolStatus name="workspace.render" status="complete" tool-call-id="gallery-workspace" :parameters="{}" result="ok" />
        </article>

        <article class="component-gallery__system-card">
          <div class="component-gallery__label"><b>Permission / approval</b><span>production class fixture</span></div>
          <section class="agui-permission"><header><b>需要你的确认</b><span>HUMAN APPROVAL</span></header><div class="permission-copy"><b>允许执行数据写入操作？</b><p>Agent 将更新目标数据集并触发下游验证任务。</p><code>dataset.sales_summary.write</code></div><div class="permission-list"><article>写入 sales_summary</article><article>触发质量验证</article></div><div class="permission-actions"><button>拒绝</button><button>仅本次允许</button></div><small>该操作会影响共享数据资产。</small></section>
        </article>

        <article class="component-gallery__system-card">
          <div class="component-gallery__label"><b>Composer / attachment</b><span>production test-id fixture</span></div>
          <div data-testid="copilot-chat-attachment-item" class="component-gallery__attachment"><button data-testid="copilot-chat-attachment-document-button"><span>PDF</span><b data-testid="copilot-chat-attachment-document-filename">sales-analysis-2026Q3.pdf</b></button><small>2.8 MB · 已上传</small></div>
          <div data-testid="copilot-chat-input-shell" class="component-gallery__composer"><textarea data-testid="copilot-chat-input-textarea" placeholder="描述你的数据业务目标…">请分析华东区最近三个月销售变化</textarea><button type="button">发送</button></div>
        </article>

        <article class="component-gallery__system-card">
          <div class="component-gallery__label"><b>User message</b><span>Copilot message surface</span></div>
          <div data-testid="copilot-chat-user-message" class="component-gallery__user-message">分析一下华东区最近三个月销售变化，并给出异常原因。</div>
        </article>
      </div>
    </section>
  </main>
</template>

<style scoped>
.component-gallery{height:100vh;display:block;overflow:auto;background:#071019;color:#fff;padding:0 28px 64px}.component-gallery__header{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:24px;margin:0 -28px 26px;padding:22px 30px;border-bottom:1px solid rgba(184,205,224,.22);background:rgba(7,16,25,.94);backdrop-filter:blur(18px)}.component-gallery__header span,.component-gallery__section-head small{color:#b7c2d2;font-size:11px;letter-spacing:.14em}.component-gallery__header h1{margin:4px 0 5px;font-size:28px}.component-gallery__header p{margin:0;color:#d9e1ec;font-size:13px}.component-gallery__stats{min-width:132px;padding:10px 14px;border:1px solid rgba(184,205,224,.24);border-radius:10px;background:#111d2a;text-align:right}.component-gallery__stats b{display:block;font-size:24px;color:#fff}.component-gallery__stats span{letter-spacing:0;font-size:10px}.component-gallery__section{height:auto!important;min-height:0!important;display:block!important;overflow:visible!important;border:0!important;background:transparent!important;margin:0 auto 30px;max-width:1680px}.component-gallery__section-head{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;margin:0 0 14px;padding:0 2px}.component-gallery__section-head h2{margin:3px 0 0;color:#fff;font-size:19px}.component-gallery__section-head>span{color:#b7c2d2;font-size:11px}.component-gallery__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.component-gallery__item{min-width:0;padding:12px;border:1px solid rgba(184,205,224,.18);border-radius:14px;background:#0c1621}.component-gallery__item.wide{grid-column:1/-1}.component-gallery__label{min-height:48px;display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:2px 2px 10px}.component-gallery__label>div{display:flex;align-items:center;gap:9px}.component-gallery__label code{color:#9fc2ff;font-size:10px}.component-gallery__label b{color:#fff;font-size:12px}.component-gallery__label span{max-width:58%;color:#b7c2d2;font-size:10px;line-height:1.45;text-align:right}.component-gallery__frame{min-height:220px}.component-gallery__system-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.component-gallery__system-card{min-width:0;padding:14px;border:1px solid rgba(184,205,224,.20);border-radius:14px;background:#0c1621}.component-gallery__system-card.wide{grid-column:1/-1}.component-gallery__assistant-message{padding:18px;border:1px solid rgba(184,205,224,.18);border-radius:12px;background:#101a26}.component-gallery__reasoning-body{padding:14px 16px 17px;border-top:1px solid rgba(184,205,224,.16);color:#d9e1ec;font-size:14px;line-height:1.7}.component-gallery__attachment{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;padding:10px 12px;border-radius:10px}.component-gallery__attachment button{display:flex;align-items:center;gap:9px;border:0;background:transparent;color:#fff}.component-gallery__attachment small{color:#b7c2d2}.component-gallery__composer{display:flex;align-items:flex-end;gap:10px;padding:10px;border:1px solid rgba(184,205,224,.29);border-radius:12px;background:#111b28}.component-gallery__composer textarea{min-height:62px;flex:1;resize:none;border:0;outline:0;background:transparent;color:#fff;line-height:1.55}.component-gallery__composer button,.permission-actions button{padding:8px 12px;border:1px solid rgba(184,205,224,.24);border-radius:8px;background:#1b2b3d;color:#fff}.component-gallery__user-message{margin-left:auto;max-width:72%;padding:12px 14px;border:1px solid rgba(151,175,255,.26);border-radius:12px;background:#1b2940;color:#fff;line-height:1.6}.component-gallery :deep(.copilot-chat-assistant-markdown table){width:100%;border-collapse:collapse;margin-top:12px}.component-gallery :deep(.copilot-chat-assistant-markdown th),.component-gallery :deep(.copilot-chat-assistant-markdown td){padding:8px 10px;border-style:solid;border-width:1px}.component-gallery :deep(.copilot-chat-assistant-markdown pre){padding:12px;overflow:auto}.component-gallery :deep(.copilot-chat-assistant-markdown blockquote){margin:12px 0;padding:9px 12px}.component-gallery :deep(.agui-permission){padding:14px;border-style:solid;border-width:1px;border-radius:12px}.component-gallery :deep(.agui-permission header){display:flex;justify-content:space-between;gap:12px;margin-bottom:12px}.component-gallery :deep(.permission-copy){display:flex;flex-direction:column;gap:6px}.component-gallery :deep(.permission-list){display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}.component-gallery :deep(.permission-list article){padding:9px;border-style:solid;border-width:1px;border-radius:8px}.component-gallery :deep(.permission-actions){display:flex;gap:8px;margin-bottom:9px}@media(max-width:1000px){.component-gallery__grid,.component-gallery__system-grid{grid-template-columns:1fr}.component-gallery__item.wide,.component-gallery__system-card.wide{grid-column:auto}.component-gallery__header{align-items:flex-start}.component-gallery__stats{display:none}}@media(max-width:640px){.component-gallery{padding:0 12px 40px}.component-gallery__header{margin:0 -12px 20px;padding:16px}.component-gallery__label{display:block}.component-gallery__label span{display:block;max-width:none;margin-top:6px;text-align:left}}
</style>
