import type { WorkspaceDocument } from './types'

/**
 * Full-screen seed data used only when VITE_DEMO_MODE=true.
 * Production mode never imports this document into a new workspace.
 */
export function createDemoDocument(threadId: string): WorkspaceDocument {
  return {
    threadId,
    title: '经营态势总览',
    subtitle: 'AI 正在持续理解指标、异常与驱动因素',
    updatedAt: Date.now(),
    widgets: [
      {
        id: 'summary',
        component: 'ui.executiveSummary',
        colSpan: 12,
        props: {
          title: '今日智能摘要',
          summary: '核心经营指标整体稳健，GMV 与活跃用户保持增长；华东区域贡献最突出，但服饰品类退款率出现连续抬升，建议优先关注。',
          confidence: 92,
          tags: ['增长', '华东', '退款风险', '新客转化'],
          highlights: [
            { label: 'GMV', value: '+8.6%', tone: 'positive' },
            { label: '活跃用户', value: '+12.4%', tone: 'positive' },
            { label: '退款率', value: '+1.9pp', tone: 'negative' },
          ],
        },
      },
      {
        id: 'kpis',
        component: 'ui.kpis',
        colSpan: 12,
        props: {
          title: '关键经营指标',
          items: [
            { label: 'GMV', value: '1,286', unit: '万', delta: 8.6, description: '环比' },
            { label: '订单量', value: '32.8', unit: '万', delta: 5.2, description: '环比' },
            { label: '客单价', value: 392, unit: '元', delta: 3.1, description: '环比' },
            { label: '活跃用户', value: '18.3', unit: '万', delta: 12.4, description: '环比' },
            { label: '退款率', value: 2.1, unit: '%', delta: -0.3, description: '环比' },
          ],
        },
      },
      {
        id: 'agent-graph', component: 'ui.agentGraph', colSpan: 8, minHeight: 350,
        props: { title: '智能分析编排', orchestrator: { id:'orchestrator', name:'Data Orchestrator', role:'ORCHESTRATOR', task:'拆解问题、协调子 Agent 并合成结论', status:'running', progress:72, tools:['plan','route','synthesize'], output:'正在等待 Insight Agent 完成归因' }, agents: [
          { id:'sql-agent', name:'SQL Agent', role:'QUERY', task:'生成并执行经营指标查询', status:'done', progress:100, durationMs:1840, tools:['semantic_search','query_sql'], output:'返回 1,284 rows' },
          { id:'quality-agent', name:'Quality Agent', role:'TRUST', task:'检查指标口径与数据质量', status:'done', progress:100, durationMs:2260, tools:['profile','quality_check'], output:'可信度 94/100' },
          { id:'insight-agent', name:'Insight Agent', role:'REASON', task:'执行异常检测与增长归因', status:'running', progress:68, durationMs:4120, tools:['anomaly','attribution'], output:'已定位 3 个主要贡献因素' },
          { id:'forecast-agent', name:'Forecast Agent', role:'PREDICT', task:'评估未来 7 天趋势', status:'waiting', progress:12, tools:['forecast'], output:'等待归因结果' },
        ] },
      },
      {
        id: 'agent-activity', component: 'ui.agentActivity', colSpan: 4, minHeight: 350,
        props: { title:'实时协作', items:[
          { time:'16:08:21', agent:'SQL Agent', message:'经营主题查询完成，返回 1,284 rows', status:'success', meta:'1.84s' },
          { time:'16:08:22', agent:'Quality Agent', message:'口径一致性检查通过，订单主题延迟 2m', status:'success', meta:'94/100' },
          { time:'16:08:23', agent:'Insight Agent', message:'正在计算渠道与区域贡献度', status:'running', meta:'68%' },
          { time:'16:08:25', agent:'Forecast Agent', message:'已加载预测窗口，等待上游特征', status:'info', meta:'WAITING' },
        ] },
      },
      {
        id: 'agent-timeline', component: 'ui.agentTimeline', colSpan: 12,
        props: { title:'并行执行时间线', totalMs:6800, items:[
          { id:'sql-agent', name:'SQL Agent', startMs:120, durationMs:1840, status:'done', label:'QUERY' },
          { id:'quality-agent', name:'Quality Agent', startMs:480, durationMs:2260, status:'done', label:'TRUST' },
          { id:'insight-agent', name:'Insight Agent', startMs:1640, durationMs:4120, status:'running', label:'ATTRIBUTION' },
          { id:'forecast-agent', name:'Forecast Agent', startMs:5020, durationMs:1280, status:'waiting', label:'FORECAST' },
        ] },
      },
      {
        id: 'trend',
        component: 'ui.lineChart',
        colSpan: 8,
        props: {
          title: '近 7 日 GMV 趋势',
          unit: '万元',
          points: [
            { label: '08-08', value: 151 }, { label: '08-09', value: 158 }, { label: '08-10', value: 176 },
            { label: '08-11', value: 183 }, { label: '08-12', value: 172 }, { label: '08-13', value: 196 }, { label: '08-14', value: 208 },
          ],
        },
      },
      {
        id: 'quality',
        component: 'ui.dataQuality',
        colSpan: 4,
        props: {
          title: '数据可信度', score: 94, status: 'excellent',
          dimensions: [
            { label: '完整性', score: 98 }, { label: '唯一性', score: 96 }, { label: '及时性', score: 91, note: '订单主题延迟 2m' },
          ],
        },
      },
      {
        id: 'root-cause',
        component: 'ui.rootCause',
        colSpan: 7,
        props: {
          title: '增长驱动归因', target: 'GMV +8.6%',
          factors: [
            { label: '华东新客转化', contribution: 4.1, description: '活动渠道转化率提升 3.8pp' },
            { label: '直播渠道', contribution: 2.7, description: '高客单商品成交增加' },
            { label: '复购用户', contribution: 1.9, description: '30 天复购率提升' },
            { label: '服饰退款', contribution: -1.2, description: '尺码相关退款上升' },
          ],
        },
      },
      {
        id: 'insights',
        component: 'ui.insights',
        colSpan: 5,
        props: {
          title: 'AI 发现',
          items: [
            { title: '华东增长显著', description: '贡献本期 GMV 增量的 47.6%。', severity: 'success', metric: '+18.2%' },
            { title: '退款率需要关注', description: '服饰品类连续三天高于动态阈值。', severity: 'warning', metric: '8.7%' },
            { title: '直播渠道有放大机会', description: '转化提升，但流量占比仍低于历史峰值。', severity: 'info', metric: '+21%' },
          ],
        },
      },
      {
        id: 'trace',
        component: 'ui.queryTrace',
        colSpan: 12,
        props: {
          title: '最近一次智能分析链路', durationMs: 1382,
          steps: [
            { title: '意图理解', description: '识别经营概览与异常洞察意图', status: 'done', durationMs: 62, kind: 'intent' },
            { title: '语义匹配', description: '匹配 GMV / 订单 / 用户 / 退款指标', status: 'done', durationMs: 118, kind: 'semantic' },
            { title: '生成查询', description: '构建多维指标查询', status: 'done', durationMs: 204, kind: 'sql' },
            { title: '执行计算', description: '聚合最近 7 日与环比窗口', status: 'done', durationMs: 617, kind: 'execute' },
            { title: '形成洞察', description: '完成异常识别与贡献拆解', status: 'done', durationMs: 381, kind: 'insight' },
          ],
        },
      },
    ],
  }
}
