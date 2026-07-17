# V1 本地交付闭环实施计划

## 方案摘要

以 `SiteRevision` 作为审核对象，在不可变配置快照之外增加可迁移的 `contentStatus` 工作流元数据。审核动作由单一服务统一处理：校验站点、Revision、健康 Deployment 与期望状态后，在仓库事务中同时追加 ReviewRecord、条件更新内容状态并写 AuditLog。这样既保留配置不可变性，又避免状态更新与审核留痕出现部分成功。

ReviewRecord 采用追加式事件模型。预览发送、客户反馈和客户确认分别对应稳定 kind；客户端不能传入操作者和记录时间。状态语义由服务端动作决定，不提供任意状态写入。显式归档使用独立状态迁移接口，同样要求 `expectedStatus` 并写审计。

本阶段继续使用现有本地发布器、真实模板构建、active pointer 和 MySQL 测试库，不接入云服务。新增闭环验收脚本驱动内存/本地适配器走完整运营流程，并由 MySQL 集成测试证明物理约束与持久化。

## 数据与契约变化

### SiteRevision 内容状态

- `ContentStatus = draft | review_requested | approved | archived`；
- `site_revisions.content_status` 非空，默认 `draft`，由 CHECK 约束枚举；
- API 的 Revision 表示增加 `contentStatus`；
- 配置 JSON 继续不可变；只允许通过审核服务或归档命令条件更新状态；
- 状态更新条件包含 `(site_id, revision, expected_status)`，不命中时区分资源不存在与状态冲突。

### ReviewRecord

新增 `review_records`：

- `review_id` 主键；
- `site_id + revision` 复合外键引用 SiteRevision；
- `deployment_id + site_id + revision` 复合外键保证预览发送引用同站健康 Deployment；反馈/确认必须复用最近一次 `preview_sent` 的 Deployment；
- `kind: preview_sent | customer_feedback | customer_confirmed`；
- `outcome: pending | changes_requested | approved`，由 kind 唯一映射；
- `channel: wechat | phone | email | in_person | other`；
- `preview_url`、受限长度 `note`；
- `recorded_by`、`recorded_at` 由服务端产生；
- `(site_id, recorded_at)` 与 `(site_id, revision, recorded_at)` 支持审核时间线；
- 不实现 update/delete。

### 原子仓库操作

仓库新增：

- `getRevision` / `getRevisions` 返回 contentStatus；
- `transitionRevisionStatus`：只用于显式归档；
- `createReviewRecord`：在单个事务内锁定 Revision 与 Deployment、验证 expectedStatus、追加记录、更新状态、写两条审计；
- `listReviewRecords(siteId, revision?)`；
- 现有 `getAuditLogs(siteId)` 暴露为只读 API。

内存仓库保持同样的先校验后原子提交语义；MySQL 仓库使用事务与 `SELECT ... FOR UPDATE`。

## API 与界面变化

### API

| 方法 | 路径 | 语义 |
| --- | --- | --- |
| `POST` | `/sites/:siteId/revisions/:revision/archive` | 以 expectedStatus 将 Revision 迁移为 archived。 |
| `GET` | `/sites/:siteId/reviews?revision=` | 返回本站全部或指定 Revision 的审核时间线。 |
| `POST` | `/sites/:siteId/reviews` | 记录 preview_sent、customer_feedback 或 customer_confirmed，并执行对应状态迁移。 |
| `GET` | `/sites/:siteId/audit-logs` | 返回本站有序审计时间线。 |

`POST /reviews` 请求包含 `revision`、`deploymentId`、`kind`、`channel`、`note`、`expectedStatus`。服务端从健康 Deployment 读取 previewUrl，禁止客户端伪造；`customer_feedback` 和 `customer_confirmed` 的 Deployment 必须等于最近一次 `preview_sent` 记录。错误使用稳定代码：`revision_not_found`、`deployment_not_found`、`review_deployment_mismatch`、`review_transition_invalid`、`review_status_conflict`。

### 后台

- Revision 历史显示 contentStatus；
- 当前工作 Revision 显示内容状态；
- 健康预览可“记录已发送”，填写渠道和备注；
- `review_requested` 可记录“客户反馈”或“客户确认”；
- 显示按时间排序的审核记录，包含 Revision、类型、结果、渠道、备注、操作者和时间；
- 可显式归档符合规则的 Revision；
- 站点切换时清空旧站审核状态，异步响应继续用当前 siteId 防串站。

## 测试与验收

- 仓库单元测试：初始状态、新 Revision 状态、合法迁移、非法迁移、并发冲突、追加不可变；
- API 测试：请求校验、健康 Deployment 绑定、反馈/确认、归档、审计和跨站拒绝；
- 后台测试：状态展示、记录发送、反馈、确认、时间线和站点切换；
- MySQL 集成测试：migration、CHECK/复合外键、事务原子性、状态条件更新、重启后读取和跨站引用拒绝；
- 本地闭环验收：真实模板发布两个 Revision，完成审核与回滚，断言 ReviewRecord、AuditLog、内容状态、active artifact 和 Revision 归属。

## 风险与回滚

- 若直接开放任意状态写入，客户端可绕过审核证据；API 只暴露业务动作和受限归档。
- 若 ReviewRecord、状态更新和审计分开提交，会产生不一致；MySQL 必须单事务，内存实现必须先完成全部校验再提交。
- 若反馈或确认允许任意健康 Deployment，会造成“发送 A、确认 B”的不可追溯留痕；事务内必须验证最近 `preview_sent` 的 Deployment 一致。
- `archived` 是终态，但不能删除 Revision 或 artifact；需要恢复内容时基于历史配置创建新 Revision。
- 审核确认不等于正式生产发布；后台文案和长期文档必须继续区分 approved 内容与 healthy 预览。
- migration 只追加；失败时停止 API/Worker、保留 journal 与备份，使用后续前向 migration 修复，不改写既有 migration。

## 必须同步的长期文档

- [ ] `README.md`：更新当前阶段与本变更归档入口。
- [ ] `docs/展站计划.md`：在 Phase 3 与 Phase 4 之间加入 V1 本地交付闭环并更新下一步。
- [ ] `docs/展站-产品需求文档(PRD).md`：回写 ReviewRecord、内容状态、API 与新增验收事实。
- [ ] `docs/guides/DATABASE.md`：记录 content_status、review_records、约束和 migration。
- [ ] `docs/guides/DEV_GUIDE.md`：记录后台审核流程与本地闭环验收命令。
- [ ] `docs/guides/DEPLOYMENT.md`：明确 approved 与 healthy 正交，以及正式发布仍未启用。
- [ ] `deploy/README.md`：同步 migration 与验收入口。

## 实施顺序

1. 固化内容状态、ReviewRecord、迁移规则和稳定错误契约。
2. 追加 Drizzle schema、前向 migration、仓库类型与内存实现。
3. 实现 MySQL 事务、复合约束、状态条件更新和审核查询。
4. 实现审核/归档/审计 API 与隔离审计。
5. 实现后台状态、审核动作和时间线。
6. 增加仓库、API、后台和 MySQL 测试。
7. 增加并运行完整本地交付闭环验收。
8. 运行全量检查与构建，回写长期文档并归档变更包。
