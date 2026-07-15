# Phase 1：实施摘要

1. 建立 pnpm workspace：`apps/admin`、`apps/api`、`packages/site-config`、`templates/b2b-manufacturing-v1`。
2. 将 SiteConfig v1 转为共享 Zod 契约和 TypeScript 类型。
3. 定义 `sites`、`site_revisions`、`audit_logs`，并提供 MySQL migration。
4. 实现 Hono API 与内存/ MySQL repository。
5. 建立最小后台和配置驱动模板。
6. 通过单元测试、API 并发测试、模板渲染测试和全量构建验证。

稳定结论已回写至 `README.md`、`docs/guides/DEV_GUIDE.md`、`docs/guides/DATABASE.md`、展站 PRD 与项目计划。
