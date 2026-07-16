# Phase 3：本地可靠性实施计划

## 方案摘要

将“构建 artifact”和“对外激活版本”彻底分离。Worker 继续生成不可变 BuildArtifact，但发布时先把候选内容准备到不可变 release 前缀，完成路由与资源健康检查后，才通过带版本号的站点预览指针原子激活。失败发生在激活前时，当前健康指针不变；激活操作必须携带 Deployment 的有效 lease token 和预期指针版本，过期 Worker 或并发旧任务不能覆盖新版本。

Deployment 增加任务类型、尝试次数、错误分类和下次可领取时间。Worker 只重试明确属于 transient 的错误，最多 3 次；校验、授权、跨站、配置缺失等 permanent 错误直接失败。每次尝试写入追加式阶段日志。回滚复用同一部署状态机：创建 `kind=rollback` 的新 Deployment，绑定同站点 ready artifact，准备并验证候选版本后原子激活，不修改历史记录。

本阶段由内存对象存储、loopback 静态服务器和可注入故障的发布器完成验收，同时在真实 MySQL 测试库证明条件更新、唯一性、外键和并发领取。云适配器不在本阶段实现。

## 数据与契约变化

### 当前预览状态

新增站点级预览状态（建议 `site_preview_states`）：

- `site_id + environment` 唯一，Phase 3 仅允许 `preview`；
- `active_artifact_id`、`active_deployment_id`、`preview_url`；
- `version` 作为乐观并发/Fencing 版本；
- `activated_at`、`updated_at`；
- 复合外键保证 active artifact 和 deployment 均属于同一站点。

激活必须在单个仓库事务中以 `site_id + environment + expected_version` 条件更新。条件不命中返回稳定的 `activation_conflict`，不得盲目覆盖。

### Deployment 与尝试调度

在现有 `deployments` 上追加：

- `kind: publish | rollback`，默认 `publish`；
- `target_artifact_id`，回滚任务创建时必须绑定同站点 `ready` artifact；
- `attempt_count`、`max_attempts`（本阶段固定为 3）；
- `next_attempt_at`、`last_error_code`、`last_error_class: transient | permanent`；
- 必要时扩展状态为 `retry_waiting`，领取查询只选择到期任务或租约过期任务。

幂等键唯一性继续生效。回滚请求也必须带客户端幂等键；相同站点、操作类型和幂等键返回同一任务。

### 阶段日志

新增追加式 `deployment_events`：

- `event_id`、`deployment_id`、`site_id`、`attempt`、`sequence`；
- `stage`、`level`、`code`、经过清洗的 `message`；
- `created_at`；
- 复合外键确保事件与 Deployment 属于同一站点；
- `(deployment_id, attempt, sequence)` 唯一，支持幂等追加与稳定排序。

日志记录稳定代码和安全摘要，不持久化环境变量、凭据、签名查询参数、完整内部对象 URL 或原始堆栈。

### 发布存储布局

- artifact 保持 `artifacts/{siteId}/r{revision}/{templateVersion}/{artifactId}/`；
- 候选 release 使用不可变前缀 `releases/{siteId}/{deploymentId}/{artifactId}/`；
- `previews/{siteId}` 不再逐文件原地覆盖；本地适配器通过持久化 active pointer 解析当前 release；
- 仅在候选 release 健康检查通过后切换指针。

## API 与界面变化

### API

在现有 `/sites/:siteId` 下扩展：

| 方法 | 路径 | 语义 |
| --- | --- | --- |
| `GET` | `/sites/:siteId/preview-state` | 返回当前激活 artifact、来源 Deployment、URL 和版本。 |
| `GET` | `/sites/:siteId/artifacts` | 返回本站可回滚的 ready artifact；不暴露其他站点是否存在。 |
| `GET` | `/sites/:siteId/deployments/:jobId/events` | 按顺序返回该任务的安全阶段日志。 |
| `POST` | `/sites/:siteId/rollbacks` | 接收 `artifactId` 与幂等键，创建回滚 Deployment。 |

现有 Deployment 查询增加 `kind`、`attemptCount`、`nextAttemptAt`、稳定错误码和当前是否仍在提供上一健康版本。所有读取与写入先验证操作者和 `siteId` scope；跨站目标统一返回不泄露资源存在性的拒绝响应，并写安全审计。

### Worker 状态机

1. 原子领取到期 Deployment，获得递增 lease token，追加 `claimed` 事件。
2. `publish` 构建或复用 ready artifact；`rollback` 验证目标 artifact 为同站点 ready 状态。
3. 将 artifact 准备到不可变 release 前缀，追加 `release_prepared`。
4. 对候选 release 执行五个路由和关键资源健康检查。
5. 在数据库事务中以预期 preview-state version 和有效 lease token 原子激活。
6. 写 `healthy` 状态、激活事件和审计。
7. 异常先分类并清洗：transient 且未耗尽时写 `retry_waiting + next_attempt_at`；否则写 `failed`。任何失败路径都不得清空或替换既有 active pointer。

退避策略使用注入式 Clock/Scheduler，默认可采用 1 秒、5 秒、30 秒；测试使用虚拟时钟，不通过真实等待拖慢套件。

### 错误分类

- transient：受控构建进程暂时失败、对象存储暂时不可用、网络超时、HTTP 5xx、租约外的可恢复发布错误；
- permanent：站点/Revision/Asset 不存在、Asset 校验失败、跨站目标、授权失败、preview 配置缺失、HTTP 4xx（明确可重试的限流除外）；
- concurrency：租约丢失或激活版本冲突，旧 Worker 立即停止写入；由仍持有合法任务的 Worker 或新任务决定后续，不把它伪装成发布成功。

### 后台

- 预览面板显示当前健康 artifact 与对应 Revision；
- Deployment 展示类型、attempt、下一重试时间、错误码和阶段日志；
- 历史 ready artifact 提供回滚按钮，确认框明确目标 Revision/artifact；
- 失败后明确显示“当前预览仍为上一健康版本”或“尚无健康版本”；
- 不向界面输出内部对象键、签名 URL、堆栈或凭据。

## 测试与故障演练

- 仓库单元测试：原子激活、版本冲突、事件顺序、到期领取、最大尝试次数；
- Worker 测试：各阶段故障注入、错误分类、退避、重启恢复、租约 fencing；
- API 测试：回滚幂等、非法 artifact、跨站读取/回滚、日志清洗；
- MySQL 集成测试：migration、复合外键、并发激活、过期 Worker、跨站约束；
- 后台测试：重试状态、日志展示、回滚确认和安全错误文案；
- 本地验收：先发布 A，再对 B 注入构建/发布/健康检查失败，持续读取 A；随后成功发布 B，再回滚 A，并验证每次切换均为完整版本。

## 风险与回滚

- 若仍复制到可变 preview 目录后再检查，AC-09 无法成立；必须先验证不可变候选版本，再切换指针。
- 数据库激活成功但 Worker 未收到响应会造成“确认丢失”；重试必须读取 preview state，以 deployment/artifact 判断激活是否已完成，保证幂等。
- 自动重试可能放大永久故障；仅白名单 transient 错误可重试，并限制次数。
- 日志可能泄密；采用结构化稳定代码、统一清洗函数和敏感样例测试。
- migration 仅追加，先在独立测试库执行；不修改 Phase 2 已登记 migration。
- 若 Phase 3 实现需撤回，停止新 Worker 并保留最后 active pointer；新增表/列不做自动向下 migration，后续以前向 migration 修复。

## 必须同步的长期文档

- [x] `README.md`：更新当前阶段和 Phase 3 活跃/归档入口。
- [x] `docs/展站计划.md`：同步 Phase 3 本地可靠性进度与线上门槛。
- [x] `docs/展站-产品需求文档(PRD).md`：回写 AC-09、AC-10、AC-12 的稳定实现事实。
- [x] `docs/guides/DATABASE.md`：记录 preview state、重试字段、阶段日志、约束和 migration。
- [x] `docs/guides/DEV_GUIDE.md`：记录本地 Worker、虚拟故障注入和可靠性验收命令。
- [x] `docs/guides/DEPLOYMENT.md`：记录原子激活/回滚策略，并继续标明真实云未验收。
- [x] `deploy/README.md`：同步 Worker 与 migration 的实际运行入口。

## 实施顺序

1. 固化状态机、错误分类、原子激活和回滚契约，先编写失败保护测试。
2. 追加 Drizzle schema、前向 migration、仓库接口及内存/MySQL 实现。
3. 将发布器拆为候选 release 准备、健康检查和原子激活三个步骤。
4. 实现 Deployment 事件、日志清洗、有界重试和重启/租约恢复。
5. 实现 preview state、artifact 列表、事件查询与回滚 API。
6. 实现后台当前版本、重试/日志和回滚交互。
7. 运行 MySQL 集成、全量测试、构建和本地故障演练。
8. 回写长期文档，记录验证证据后归档本变更包。
