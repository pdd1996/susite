# Phase 1：配置与 Revision Spec

| 项目 | 内容 |
| --- | --- |
| 状态 | 已归档 |
| 记录性质 | Phase 1 实现后的追溯补录；后续变更遵循 ADR-0002 |
| 创建日期 | 2026-07-15 |
| 完成日期 | 2026-07-15 |
| 关联长期文档 | 展站 PRD、展站计划、SiteConfig Schema、数据库设计 |

## 目标

建立展站平台的最小可运行闭环：创建站点、服务端校验配置、生成不可变 Revision，并以固定 B2B 模板展示金源示例。

## 非目标

- OSS 素材上传与 Asset 实体；
- 异步构建、HTTPS 预览和部署回滚；
- 客户账号、正式域名与备案。

## 验收结果

- [x] SiteConfig Schema 对应的 Zod 校验和类型可用；
- [x] API 支持创建站点、创建/查询 Revision；
- [x] 旧 Revision 不可修改，陈旧 `expectedRevision` 返回 `409`；
- [x] Drizzle 数据模型和 MySQL 基线 migration 已提供；
- [x] 金源固定模板和运营后台可构建；
- [x] `pnpm check` 与 `pnpm build` 通过。

首次归档后的审查问题由 `phase-1-hardening` Spec 修复，不应将本文视为实施前已冻结的原始 Spec。
