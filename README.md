# 展站（ZhanSite）

展站是面向 B2B 制造、贸易企业的**配置驱动建站与预览发布平台**。V1 服务内部运营与交付人员：通过固定模板、版本化配置和素材管理，在短时间内交付可通过微信分享的企业官网预览链接。

> 当前仓库同时承载产品与交付文档，以及 Phase 1 的可运行平台代码。

## 当前状态

- **当前阶段**：Phase 0 与 Phase 1（配置与版本）已完成；Phase 2（素材与预览）待启动。
- **V1 范围**：内部运营后台、`SiteRevision`、素材上传、异步构建与平台预览。
- **V1 非目标**：客户自助 SaaS、产品化 AI Agent、客户正式域名绑定和 ICP 流程。
- **首个样板**：杭州金源电器；可运行的原型位于相邻的 `jinyuan-mvp` 工作区。

## 文档导航

| 文档 | 用途 |
| --- | --- |
| [展站 PRD](./docs/展站-产品需求文档(PRD).md) | V1 范围、功能、数据模型、API、验收标准与技术方案 |
| [展站计划](./docs/展站计划.md) | 架构、阶段、当前进展与下一步行动 |
| [SiteConfig v1 JSON Schema](./docs/schemas/site-config-v1.schema.json) | 配置的机器可读契约；Phase 1 的实现基线 |
| [Demo 迁移到 V1](./docs/migration-demo-to-v1.md) | `jinyuan-mvp` 原型与正式平台的数据、存储和发布模型差异 |
| [文档权威来源 ADR](./docs/adr/ADR-0001-doc-authority.md) | 文档职责、冲突处理与同步规则 |
| [Spec 文档治理 ADR](./docs/adr/ADR-0002-spec-driven-document-governance.md) | 变更 Spec 的创建、验收、回写和归档规则 |
| [变更 Spec 使用说明](./.doc/README.md) | 活跃变更包、归档与模板 |
| [Phase 1 开发指南](./docs/guides/DEV_GUIDE.md) | 安装、运行、验证与工作区说明 |
| [Phase 1 数据库设计](./docs/guides/DATABASE.md) | 数据模型、并发控制与 migration |
| [金源样板站索引](./docs/jinyuan/README.md) | 样板站范围、待补齐项与文档导航 |
| [金源官网 PRD](./docs/jinyuan/金源电器官网-产品需求文档(PRD).md) | 首个样板客户的内容与功能需求 |
| [金源设计规范](./docs/jinyuan/金源电器官网-设计规范.md) | 样板站视觉与交互规范 |

## 按角色阅读

- **产品 / 运营**：先阅读展站 PRD 与展站计划。
- **开发者**：从开发指南开始；跨模块功能先创建变更 Spec，再阅读 Schema、数据库设计与迁移说明。
- **交付 / 内容人员**：从金源样板站索引进入客户 PRD、设计规范和首页文案。

## 仓库与原型的关系

```text
susite（Phase 1 monorepo）
  ├─ docs/：产品、交付和开发规范
  ├─ .doc/：活跃与归档的变更 Spec
  ├─ packages/site-config：配置契约
  ├─ apps/admin、apps/api：内部运营平台
  └─ templates/b2b-manufacturing-v1：固定站点模板

jinyuan-mvp（相邻原型工作区）
  ├─ Vite + React 的金源展示站与后台 Demo
  ├─ site.config.json + localStorage + 模拟发布
  └─ 用于验证模板，不是展站平台实现
```

平台采用 pnpm workspace，包含 `apps/admin`、`apps/api`、`templates/b2b-manufacturing-v1` 和 `packages/site-config`。Schema 与 PRD 是配置契约的权威来源，运行时 Zod 实现位于 `packages/site-config`。

## 运行金源原型

在 `jinyuan-mvp` 目录中执行：

```bash
npm install
npm run dev
```

- 官网：`http://localhost:5173/#/`
- 后台 Demo：`http://localhost:5173/#/admin`

原型使用浏览器 `localStorage` 和模拟部署，不能代表 OSS 上传、服务端校验、真实 HTTPS 预览或回滚能力。

## 文档维护约定

- 详细的权威来源、冲突处理和同步要求以 [ADR-0001](./docs/adr/ADR-0001-doc-authority.md) 为准。
- 变更的创建、验收、回写和归档以 [ADR-0002](./docs/adr/ADR-0002-spec-driven-document-governance.md) 为准。
- `.cursor/rules/doc-sync.mdc` 与 `.cursor/rules/spec-governance.mdc` 会提示同步和 Spec 检查。
