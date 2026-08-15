import type { WorkspaceDocument } from './types'

/**
 * Full-screen seed data used only when VITE_DEMO_MODE=true.
 * Production mode never imports this document into a new workspace.
 */
export function createDemoDocument(threadId: string): WorkspaceDocument {
  return {
    threadId,
    title: 'SA 数据需求交付工作区',
    subtitle: '从业务目标澄清到 Specification、数据方案、数据集成、ETL 开发、治理验证与交付的全过程编排',
    updatedAt: Date.now(),
    widgets: [
      {
        id: 'summary',
        component: 'ui.executiveSummary',
        colSpan: 12,
        props: {
          title: '需求交付摘要',
          summary: '销售主题数据需求已完成范围澄清与 Specification，当前正在推进来源表映射和 ETL 开发；两个数据口径仍待业务确认，治理规则将在集成完成后自动验证。',
          confidence: 86,
          tags: ['Specification', '来源映射', 'ETL 开发', '治理验证'],
          highlights: [
            { label: 'Specification', value: '已确认', tone: 'positive' },
            { label: 'ETL 任务', value: '12 / 18', tone: 'neutral' },
            { label: '待澄清', value: '2 项', tone: 'negative' },
          ],
        },
      },
      {
        id: 'kpis',
        component: 'ui.kpis',
        colSpan: 12,
        props: {
          title: '交付状态概览',
          items: [
            { label: '需求范围', value: 8, unit: '项', description: '已确认' },
            { label: '数据实体', value: 12, unit: '个', description: '方案设计' },
            { label: '来源表', value: 26, unit: '张', description: '已映射' },
            { label: 'ETL 作业', value: 18, unit: '个', description: '12 个已完成' },
            { label: '治理规则', value: 34, unit: '条', description: '待验证' },
          ],
        },
      },
      {
        id: 'agent-graph', component: 'ui.agentGraph', colSpan: 8, minHeight: 350,
        props: { title: '数据交付编排', orchestrator: { id:'orchestrator', name:'Delivery Orchestrator', role:'ORCHESTRATOR', task:'协调需求开发阶段、依赖、质量门禁与交付', status:'running', progress:62, tools:['plan','route','validate'], output:'正在协调 ETL 开发与治理验证' }, agents: [
          { id:'spec-agent', name:'Specification Agent', role:'SPEC', task:'澄清业务范围并维护需求规格', status:'done', progress:100, durationMs:1840, tools:['clarify','specification'], output:'Specification v1.2 已确认' },
          { id:'solution-agent', name:'Solution Agent', role:'SOLUTION', task:'设计数据模型、口径与来源方案', status:'done', progress:100, durationMs:2260, tools:['model','mapping'], output:'12 个数据实体已完成设计' },
          { id:'integration-agent', name:'Integration Agent', role:'INTEGRATION', task:'完成来源接入和字段映射', status:'running', progress:78, durationMs:4120, tools:['connect','map'], output:'已映射 26 张来源表' },
          { id:'etl-agent', name:'ETL Agent', role:'DEVELOPMENT', task:'生成并验证 ETL 作业', status:'running', progress:67, tools:['generate_etl','test'], output:'12 / 18 个作业已完成' },
          { id:'governance-agent', name:'Governance Agent', role:'VALIDATION', task:'执行质量、标准与血缘验证', status:'waiting', progress:20, tools:['quality','lineage'], output:'等待集成任务完成' },
          { id:'delivery-agent', name:'Delivery Agent', role:'DELIVERY', task:'汇总资产清单与交付材料', status:'waiting', progress:8, tools:['package','handover'], output:'等待治理门禁通过' },
        ] },
      },
      {
        id: 'agent-activity', component: 'ui.agentActivity', colSpan: 4, minHeight: 350,
        props: { title:'实时协作', items:[
          { time:'16:08:21', agent:'Specification Agent', message:'Specification v1.2 已完成业务确认', status:'success', meta:'DONE' },
          { time:'16:08:22', agent:'Solution Agent', message:'数据模型与来源映射方案已生成', status:'success', meta:'12 entities' },
          { time:'16:08:23', agent:'Integration Agent', message:'正在校验来源表字段映射', status:'running', meta:'78%' },
          { time:'16:08:25', agent:'ETL Agent', message:'已生成并测试 12 个 ETL 作业', status:'running', meta:'12 / 18' },
        ] },
      },
      {
        id: 'agent-timeline', component: 'ui.agentTimeline', colSpan: 12,
        props: { title:'并行执行时间线', totalMs:6800, items:[
          { id:'spec-agent', name:'Specification', startMs:120, durationMs:1840, status:'done', label:'SPEC' },
          { id:'solution-agent', name:'数据方案', startMs:480, durationMs:2260, status:'done', label:'SOLUTION' },
          { id:'integration-agent', name:'数据集成', startMs:1640, durationMs:4120, status:'running', label:'INTEGRATION' },
          { id:'etl-agent', name:'ETL 开发', startMs:2800, durationMs:3600, status:'running', label:'DEVELOPMENT' },
        ] },
      },
      {
        id: 'trend',
        component: 'ui.lineChart',
        colSpan: 8,
        props: {
          title: '近 7 日交付完成度',
          unit: '%',
          points: [
            { label: '08-08', value: 12 }, { label: '08-09', value: 18 }, { label: '08-10', value: 27 },
            { label: '08-11', value: 36 }, { label: '08-12', value: 44 }, { label: '08-13', value: 55 }, { label: '08-14', value: 62 },
          ],
        },
      },
      {
        id: 'quality',
        component: 'ui.dataQuality',
        colSpan: 4,
        props: {
          title: '治理验证', score: 82, status: 'good',
          dimensions: [
            { label: '命名标准', score: 96 }, { label: '质量规则', score: 78, note: '待执行 8 条' }, { label: '血缘完整性', score: 72, note: '等待 ETL 完成' },
          ],
        },
      },
      {
        id: 'delivery-plan',
        component: 'ui.analysisPlan',
        colSpan: 7,
        props: {
          title: 'SA 数据需求交付计划',
          steps: [
            { title: '需求澄清与 Specification', description: '范围、口径与验收标准已确认', status: 'done' },
            { title: '数据方案', description: '模型、来源和映射方案已完成', status: 'done' },
            { title: '数据集成与 ETL 开发', description: '来源接入和作业开发进行中', status: 'running' },
            { title: '治理验证与交付', description: '等待上游开发完成后执行', status: 'pending' },
          ],
        },
      },
      {
        id: 'insights',
        component: 'ui.insights',
        colSpan: 5,
        props: {
          title: '待确认事项与风险',
          items: [
            { title: '订单状态口径待确认', description: '取消后恢复的订单是否计入有效订单仍需业务确认。', severity: 'warning', metric: '待确认' },
            { title: '客户主数据存在重复映射', description: '两个来源系统使用不同客户编码，需要制定合并规则。', severity: 'danger', metric: '2 sources' },
            { title: 'Specification 已完成评审', description: '需求范围和验收标准已完成业务与技术双重确认。', severity: 'success', metric: 'v1.2' },
          ],
        },
      },
      {
        id: 'trace',
        component: 'ui.queryTrace',
        colSpan: 12,
        props: {
          title: '最近一次需求交付链路', durationMs: 1382,
          steps: [
            { title: '需求澄清', description: '识别业务目标、范围和验收标准', status: 'done', durationMs: 62, kind: 'intent' },
            { title: 'Specification', description: '固化实体、字段、口径与边界条件', status: 'done', durationMs: 118, kind: 'semantic' },
            { title: '数据方案', description: '设计模型、来源映射和加工逻辑', status: 'done', durationMs: 204, kind: 'sql' },
            { title: '集成与 ETL', description: '执行来源接入、作业生成和测试', status: 'running', durationMs: 617, kind: 'execute' },
            { title: '治理与交付', description: '执行质量、标准、血缘验证并生成交付物', status: 'pending', durationMs: 381, kind: 'insight' },
          ],
        },
      },
    ],
  }
}
