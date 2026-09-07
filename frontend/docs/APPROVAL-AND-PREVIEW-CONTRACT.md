# 审批输入与预览边界

## 审批表单子集

`approvalSchema.ts` 定义当前前端可呈现并验证的 responseSchema 子集。表单展示、文件快速确认及运行时 resume 使用同一验证逻辑；cancelled 决策不按 resolved 答案验证。

主中断卡片提供取消入口：将当前所有待办一次提交为 cancelled，不伪造 schema 答案，busy 时禁用。表单取消由上游 cancel 接口处理；权限中断映射为 reject。取消待办不等于停止整个运行，模型可能继续解释取消结果。

支持：

- 根级 string、number、integer、boolean，以及由标量 enum/const/oneOf const 构成的选项。
- 根级 object，字段为上述标量或枚举数组；required 字段必须存在，未填写的可选字段可以省略。
- 枚举数组，支持 minItems、maxItems、uniqueItems。
- 数字 minimum、maximum、exclusiveMinimum、exclusiveMaximum、multipleOf；拒绝非有限数及非整数的 integer。
- 字符串 minLength、maxLength（按 Unicode 码点计数）、pattern，以及 date、date-time、email、uri 的界面校验。
- title、description、default、enumNames/x-enumNames 等展示元数据；`x-custom` 延续现有可输入自定义字符串的选择框约定。

普通空字符串是否有效由 minLength、pattern、enum 等约束决定；false 和 0 是有效答案。email 校验为界面格式检查，并非完整邮箱可达性验证。

嵌套对象、自由结构数组、复杂 oneOf、allOf/anyOf、条件 schema、$ref 及未知验证关键字明确显示不支持并阻止提交。服务端仍需校验审批答案，前端校验不替代服务端授权。

date 输出 `YYYY-MM-DD`；date-time 使用日期时间选择器，输出包含秒与时区偏移的 `YYYY-MM-DDTHH:mm:ssZ`，例如 `2026-09-07T15:22:30+08:00`。默认值保留已有时间信息，编辑时采用浏览器所在时区。

多 interrupt 使用选择控件收集每项答案，通过一个 resume 提交全部待处理 ID。只有单 interrupt 才使用直接提交的快捷选项。

## A2UI 操作状态

Catalog 按钮读取由 NativeA2uiSurface 提供的运行状态，不读取模型提供的 busy 属性。立即点击锁持续到事件分发及 Vue 状态更新完成，之后以外层 running/pending interrupts 决定是否可用；不使用固定秒数解锁。

成功、失败和停止后恢复可操作状态；遇到待处理审批则保持 Agent 操作禁用。审批提交仍经过 AG-UI resume 的 ID 完整性和答案校验。

## 文本预览

普通文件与 ZIP 内部文本使用 `readBoundedText`，最多保留 1 MiB 的 UTF-8 字节。超过限制取消读取并提示截断，截断位置不输出不完整 UTF-8 字符。无 Content-Length 的响应同样受限。

普通文本若声明大小已超过上限，直接提示下载查看；ZIP 文本显示受限前缀。新文件或新 ZIP entry 清除旧内容及截断状态，过期请求不发布结果。

此限制覆盖文本读取；图片/PDF 的浏览器显示和 ZIP 二进制预览不属于该文本限制。
