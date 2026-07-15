# Phase 1 契约与治理修复实施计划

## 方案摘要

保持 JSON Schema 为配置契约的权威来源。在 Schema 中以标准关键字补足可声明的约束，并用仓库 Ajv 扩展关键字表达跨字段唯一性和引用关系；`site-config` 包导出注册这些关键字的共享函数。Zod 保留等价运行时校验。测试以同一输入同时断言 Ajv 和 Zod 的接受或拒绝结果。

## 数据与契约变化

不新增字段、不改变字段类型、不升级 `schemaVersion`。仅将既有业务约束显式写入 Schema：分类 ID 与 slug 唯一，`featuredCategoryIds` 必须来自分类 ID；必填文本不得仅由空白字符组成。

## API 与界面变化

无路由、响应结构或后台界面变化。API 和后台继续通过 `SiteConfigSchema` 执行相同的输入校验。

## 风险与回滚

新 Schema 会拒绝此前 JSON Schema 单独验证可通过、但 API 已拒绝的无效输入，因此不构成有效输入的破坏性兼容问题。使用 JSON Schema 的外部消费者必须注册仓库定义的 Ajv 扩展关键字；未注册时其校验结果不能代表服务端最终校验。

## 必须同步的长期文档

- [x] `README.md`：更新当前阶段。
- [x] `docs/展站计划.md`：更新 Phase 1 状态与归档路径。
- [x] `docs/展站-产品需求文档(PRD).md`：更新 Phase 1 里程碑状态与配置约束。
- [x] `docs/schemas/site-config-v1.schema.json`：补充可执行约束说明。

## 实施顺序

1. 更新 JSON Schema、Zod 契约和双实现一致性测试。
2. 更新 README、项目计划和 PRD 的稳定状态。
3. 运行全量检查与生产构建。
4. 在 Spec 中记录验证结果、回写完成状态并归档。
