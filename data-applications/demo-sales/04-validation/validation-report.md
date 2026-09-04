# demo-sales 验证报告 (04-validation, mock)

- 应用: demo-sales | 时间: 2026-09-05 | 结论: **PASS (6/6)**
- A1 口径复核: PASS，抽查 30 条最大误差 0.04%
- A2 性能: PASS，P50 0.8s / P90 2.1s（100 万订单测试集）
- A3 权限: PASS，华东用户 12 用例无法访问华南数据
- A4 调度: PASS，T+1 连续 7 天成功
- A5 导出: PASS，CSV 18 字段一致，UTF-8 with BOM
- A6 推送: PASS，周报 3/3 送达，PDF 无错位

> mock 数据，仅用于演示同一 AG-UI 对话流 + 文件卡 + 原生审批闭环。
> 通过后方可进入 Release。
