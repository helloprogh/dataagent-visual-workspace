# demo-sales v1 — 已发布

> 应用标识: demo-sales | 版本: v1 | 状态: **已发布**
> 发布时间: 2026-09-05 | 阶段链: Specification → Solution Design → Development → Validation → Release（五阶段均经原生审批确认）

## 交付内容
- 01-specification/analysis-spec.json：7 指标口径 + 6 验收标准
- 02-design：设计文档 + 字典 + schema.json + quality-rules.json
- 03-development：execution-plan + transform.sql + metric-contract + governance + sample 输出
- 04-validation：execution-evidence.json（6/6 PASS mock）+ validation-report.md
- 05-release/v1：本 README.md + manifest.json
- data-development-delivery.zip：聚合交付物，内含 `data-applications/demo-sales/` 完整五阶段目录，可预览目录并打开 MD/JSON/SQL

## 使用
1. 解压 `data-development-delivery.zip`，查看 `data-applications/demo-sales/` 目录结构
2. 按 `transform.sql` 建 DWD/DWS，配 T+1 调度
3. 对照 `validation-report.md` 复核 A1-A6

## 状态
**已发布** — 本文件与 manifest.json 为 Release 阶段最终证据，不在前端硬编码完成状态。
