# Phase 1 Hardening 实施计划

1. 收紧 Zod 嵌套对象，增加数组唯一性与分类引用校验。
2. 为 API 增加可信开发身份中间件、JSON 解析错误和仓库错误归一化。
3. 为 Drizzle 与 SQL migration 增加外键，补 MySQL 仓库测试边界。
4. 提取共享金源 fixture，让模板、后台和测试使用同一份有效配置。
5. 后台增加站点选择、完整 JSON 编辑和 Revision 历史。
6. 回写开发、数据库和 Phase 1 状态文档，完成验证后归档。

## 回滚

所有变化限定在 Phase 1 工作区；若持久化迁移失败，可回退新增外键 migration，并继续使用内存仓库进行本地验证。
