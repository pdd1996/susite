# V1 本地交付闭环 Spec

| 项目 | 内容 |
| --- | --- |
| 状态 | 已归档 |
| 创建日期 | 2026-07-17 |
| 完成日期 | 2026-07-17 |
| 负责人 | 展站项目 |
| 关联长期文档 | 展站 PRD、展站计划、数据库设计、开发指南、部署指南 |

## 背景

Phase 0～Phase 3 已完成配置版本、素材、本地预览发布、可靠性、回滚和 MySQL 隔离验收，但运营人员仍无法在系统内记录“预览已发送、客户反馈、客户确认”，`ReviewRecord` 与 `draft / review_requested / approved / archived` 内容状态只存在于 PRD。当前流程因此在发布之后失去可追踪性，尚不能证明从创建到客户确认、修改和回滚的完整本地交付闭环。

正式 Phase 4 依赖 OSS、平台域名、DNS、TLS、CDN 与备案，不符合当前“本地为主”的实施边界。本变更作为 Phase 3 与正式发布之间的 V1 收口阶段，只补齐本地运营交付所需的 P0 软件能力。

## 目标

- 为每个 `SiteRevision` 持久化独立的内容状态，且不与 Deployment 状态混用；
- 提供受约束、可并发保护的内容状态迁移，并为每次迁移写入审计；
- 新增不可修改的 `ReviewRecord`，记录预览发送、客户反馈、客户确认的 Revision、预览、渠道、备注、操作者和时间；
- 在后台完成审核时间线、内容状态和记录预览发送/反馈/确认操作；
- 证明“创建站点 → 配置 → 发布 → 发送审核 → 客户反馈 → 修改 → 再发布 → 客户确认 → 回滚”的本地完整流程；
- 在内存仓库与 MySQL 中证明持久化、跨站隔离、并发保护、审计完整性和端到端行为。

## 非目标

- 真实 OSS、preview 公网域名、DNS、TLS、CDN、ICP备案或客户正式域名；
- 客户登录、自助审核、多角色审批、通知发送或产品化 Agent；
- 将 ReviewRecord 当作 CRM、工单、聊天或附件系统；
- 修改 SiteConfig v1、模板页面结构或正式生产发布状态；
- 修改、删除或覆盖历史 ReviewRecord；
- 将本地验收结果表述为公网交付或云基础设施证据。

## 影响范围

- 产品：新增 V1 本地交付闭环阶段；后台补齐 Revision 内容状态与客户审核留痕。
- 配置契约：不修改 SiteConfig v1；内容状态属于 Revision 工作流元数据。
- 数据库：为 `site_revisions` 增加 `content_status`；新增追加式 `review_records` 表及同站点复合约束；新增前向 migration。
- API：增加 Revision 状态迁移、审核记录列表/新增和审计时间线查询；所有资源按 `siteId` 隔离。
- 模板 / 后台：模板不变；后台增加状态操作、审核表单与时间线。
- 测试：增加仓库、API、后台、MySQL 与本地闭环验收。
- 文档：完成后回写 PRD、计划、数据库、开发与部署指南、README。

## 内容状态与审核规则

- 新 Revision 初始状态为 `draft`。
- `draft → review_requested`：只允许通过“记录预览已发送”完成，且必须引用该 Revision 的当前或历史健康预览 Deployment。
- `review_requested → draft`：只允许通过“记录客户反馈”完成，表示需修改；反馈不修改原 Revision 配置。
- `review_requested → approved`：只允许通过“记录客户确认”完成。
- `draft / review_requested / approved → archived`：运营人员可显式归档非当前工作版本；`archived` 为终态。
- 创建新 Revision 不自动改写旧 Revision 状态，新版本始终为 `draft`。
- ReviewRecord 只追加，至少分为 `preview_sent / customer_feedback / customer_confirmed`；渠道限定为稳定枚举，备注采用受限纯文本。
- 状态迁移必须携带 `expectedStatus`；并发不匹配返回稳定冲突，禁止静默覆盖。

## 验收标准

- [x] 新建站点的 revision 1 与后续新 Revision 均以 `draft` 持久化，重启 MySQL 模式后仍可读取。
- [x] API 返回每个 Revision 的 `contentStatus`，支持带 `expectedStatus` 的合法迁移并拒绝非法、越级和并发冲突迁移。
- [x] 记录 `preview_sent` 前验证 Deployment 为同站点、同 Revision、`healthy`；成功后追加 ReviewRecord 并原子迁移为 `review_requested`。
- [x] 记录 `customer_feedback` 后追加留痕并原子迁移为 `draft`；随后修改配置必须创建新的 Revision。
- [x] 记录 `customer_confirmed` 后追加留痕并原子迁移为 `approved`。
- [x] ReviewRecord 保存 reviewId、siteId、revision、kind、outcome、channel、previewUrl、deploymentId、note、recordedBy、recordedAt，且不提供更新/删除接口。
- [x] 后台可查看当前 Revision 内容状态、审核时间线，并记录预览发送、客户反馈和确认。
- [x] 每次状态变化与 ReviewRecord 创建均写 AuditLog；后台或 API 可按站点读取有序审计时间线。
- [x] 跨站读取或引用 Revision、Deployment、ReviewRecord 均被拒绝，并写不泄露目标资源细节的安全审计。
- [x] MySQL migration、外键、复合归属、状态约束、并发更新与重启持久化集成测试通过。
- [x] 本地端到端验收覆盖创建、配置、发布、审核、反馈、修改、再发布、确认和 artifact 回滚，并断言内容状态与部署状态保持正交。
- [x] `pnpm check`、`pnpm test`、`pnpm build` 和本阶段验收命令通过。
- [x] 长期文档明确“V1 本地交付闭环已验证”与“真实云/正式发布未启用”的边界。

## 验证结果

- 测试：`pnpm check` 通过；4 个工作区类型检查通过，共 9 个测试文件、34 个测试通过。API 覆盖状态冲突、审核留痕、归档、审计和本地闭环；后台覆盖发送与确认交互；MySQL 覆盖 migration、ReviewRecord 重启持久化、复合归属、跨站拒绝和并发领取。
- 构建：`pnpm build` 通过；API 类型构建、后台 Vite 生产构建和固定模板生产构建均成功。
- 本地验收：`pnpm acceptance:operations` 通过 6 个本地闭环/MySQL 用例；`pnpm acceptance:local` 连续 20 次真实模板构建全部 healthy，P95 2037.79 ms，五个路由与关键资源可读。
- 外部门槛：真实 OSS、域名、DNS、TLS、CDN、备案和 Agent 明确不在本变更范围。
