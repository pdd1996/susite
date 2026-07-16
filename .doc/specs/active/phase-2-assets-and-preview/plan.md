# Phase 2：素材与预览实施计划

## 方案摘要

保持 `SiteRevision` 为不可变内容快照，新增独立的 `Asset`、`BuildArtifact` 和 `Deployment` 生命周期。浏览器只通过服务端签发的短时 OSS 直传凭据上传到由 `siteId`、上传会话和随机对象名限定的临时前缀；服务端在完成回调中读取对象元数据、校验文件特征与 checksum，并将通过复核的对象提升或复制到不可变 Asset 路径后登记。

保存草稿 Revision 时，API 从配置中收集所有 Asset ID：尚不存在的预留 ID 可以保留，已存在的 Asset 必须属于当前 `siteId` 且与引用字段类型兼容。构建/预览前执行完整校验，要求全部引用存在、完成复核、归属同站、类型匹配且占位素材已批准。构建运行器以 `siteId/revision/templateVersion` 为输入构建，将静态包写入不可变 artifact 前缀；仅在平台预览基础设施条件满足且 HTTPS、关键路由及静态资源检查通过时返回预览 URL。部署和 artifact 均先由 Worker 原子领取并带有限期租约：启动后会扫描 queued 与过期任务，因此进程崩溃后的任务可恢复；artifact 在写入前已被预留，避免并发覆写同一路径。本地开发默认由 API 内嵌轮询器处理，受控预览环境使用独立 Worker 进程消费同一数据库队列。Phase 3 再补齐自动重试、原子切换、回滚和故障演练。

## 数据与契约变化

### Asset

新增 `assets` 表及仓库接口，最少包含：

- `asset_id`：不可预测且全局唯一的稳定 ID；
- `site_id`：外键引用 `sites.site_id`，禁止跨站引用；
- `type`：`logo`、`product_image`、`certificate_image`、`product_pdf`、`wechat_qr`、`factory_image`；
- `status`：Phase 2 的 `Asset` 仅在完成复核后创建为 `verified`；上传中和失败状态由后台上传会话即时展示，不写成可引用 Asset。若后续需要持久化上传失败历史，再引入独立 `UploadSession`，不污染不可变 Asset。
- `source_kind`：只允许 `customer_provided`、`placeholder`；
- `placeholder_approved_by`、`placeholder_approved_at`：仅 `source_kind=placeholder` 时允许填写，且进入部署前必须同时非空；
- `object_key`、不可变的受控公开 URL 或模板可读取 URL、`content_type`、`size_bytes`、`checksum_sha256`；
- `original_filename`、`created_by`、`verified_by`、`created_at`、`verified_at`。

数据库约束负责可表达的外键、唯一性、非空约束和来源/批准字段一致性；不再增加与 `source_kind` 重复的 `is_placeholder`。服务层负责按配置位置判断 Asset 类型、对象实际 MIME/魔数校验、最大体积与占位批准状态。不要把客户端提交的 URL、MIME 或完成状态直接作为可信事实。

不修改 `SiteConfig v1` 的字段结构。建立一个从配置路径到允许 Asset 类型的共享映射，供 API、Worker 和测试共用：

| 配置路径 | 允许的 `Asset.type` |
| --- | --- |
| `brand.logoAssetId` | `logo` |
| `contact.wechatQrAssetId` | `wechat_qr` |
| `assets.pdfCatalogAssetId` | `product_pdf` |
| `assets.certificates[].assetId`、`certifications.groups[].items[].assetId` | `certificate_image` |
| `products.categories[].series[].imageAssetId` | `product_image` |
| `about.factoryImageAssetIds[]` | `factory_image` |

### 构建与部署

新增 `build_artifacts` 和 `deployments`：

- `build_artifacts` 绑定 `site_id`、`revision`、`template`、`template_version`、构建输入 checksum、不可变 `location`、`status`、租约、`created_by` 与创建时间；同一构建输入先原子预留再构建，只有成功构建的 `ready` artifact 可复用。
- `deployments` 绑定 `site_id`、`revision`、`artifact_id`、`environment=preview`、`job_id`、客户端幂等键、`status`、租约、`preview_url`、`error_summary` 和时间戳；同一站点和幂等键只能对应一个有效任务。Worker 原子领取 queued 或租约过期的任务。Phase 2 实现 `queued / building / deploying / healthy / failed` 及 HTTPS/路由/关键资源健康检查，Phase 3 再定义重试和回滚关联。
- 所有新写操作增加相应 `AuditLog` 动作，如 `asset.upload_signed`、`asset.verified`、`artifact.created`、`deployment.created`。

上传对象键必须由服务端生成，例如 `uploads/{siteId}/{uploadId}/{random}`；已复核 Asset 使用 `assets/{siteId}/{assetId}/{sha256}`；artifact 使用 `artifacts/{siteId}/r{revision}/{templateVersion}/{artifactId}/`。禁止客户端指定 bucket、其他站点前缀或最终对象键。

### MySQL 测试环境

为 API 提供显式的 `DATABASE_URL_TEST`（或同等隔离配置）与测试数据库创建/迁移脚本。每个集成测试在事务或清理后的独立 schema 中运行，绝不回退到开发 `DATABASE_URL`。测试先执行 Phase 1 与 Phase 2 migration，再断言 MySQL 的真实外键、唯一索引、事务锁和条件更新行为；内存仓库测试继续保留为快速单元测试。

## API 与界面变化

### API

在现有 `/sites/:siteId` 资源下扩展：

| 方法 | 路径 | 语义 |
| --- | --- | --- |
| `POST` | `/sites/:siteId/upload/sign` | 校验上传意图并返回单次、短时、范围受限的 OSS 直传信息；不返回长期密钥。 |
| `POST` | `/sites/:siteId/assets/complete` | 接收签名会话 ID，服务端核验 OSS 对象并创建或拒绝 Asset。 |
| `GET` | `/sites/:siteId/assets` | 返回站点素材及复核/占位状态；不得返回敏感签名。 |
| `POST` | `/sites/:siteId/deployments` | 对指定有效 Revision 创建预览构建/部署任务并返回 `jobId`。 |
| `GET` | `/sites/:siteId/deployments/:jobId` | 返回任务状态、artifact 与 HTTPS URL（可用时）以及安全的错误摘要。 |

Revision 创建 API 保持既有 `expectedRevision` 乐观并发语义。响应 `409 revision_conflict` 必须包含 `currentRevision`；Asset 校验失败返回稳定错误码和不泄露对象存储内部信息的配置路径/原因。上传、素材登记和部署均验证操作者及 `siteId`，并写审计记录。

为满足 PRD AC-01，创建站点 API 必须接收并校验初始 SiteConfig，在同一事务内创建 `Site`、revision 1 和对应审计记录；不得继续以只有 `currentRevision=0`、没有初始 Revision 的站点作为创建成功结果。AC-02 与 AC-03 作为 Phase 2 回归门槛继续执行。

### 后台

在保持 JSON 配置编辑器为 Phase 2 最小界面的前提下，新增：

1. 当前站点的素材面板：选择类型、上传、进度、复核结果、真实/占位标记和批准信息；
2. Revision 历史面板：明确当前编辑基线、历史 Revision 的创建者/时间、加载操作和只读标识；
3. 冲突处理：保存收到 `409` 时显示服务器当前 Revision 和“重新加载最新版本”操作；重新加载前保留未保存文本或要求显式确认，不自动覆盖；
4. 预览面板：选择 Revision、触发部署、轮询任务状态、复制 HTTPS URL、展示占位素材警告。

后台测试使用可控的 API mock 或测试服务器模拟成功、资产拒绝和 `409` 场景，断言用户可见状态和请求参数；不以纯函数测试替代该交互覆盖。

## OSS、构建和 HTTPS 预览流程

1. 运营人员在后台选择站点、素材类别、真实/占位来源；占位提交时记录批准人。
2. API 校验站点和上传意图，生成短时签名/STS 或预签名请求，并限制 `siteId` 前缀、Content-Type、Content-Length 和过期时间。
3. 浏览器直传 OSS 临时路径，再调用完成接口；API 校验对象 HEAD 信息、文件魔数或受控解析、checksum、大小和类型后创建 `verified` Asset；失败只返回稳定错误且不给出可引用 Asset ID。同一签名上传令牌重复完成时返回同一 Asset。
4. 运营人员保存草稿配置。API 允许尚不存在的预留 Asset ID，但拒绝已存在且跨站或类型不匹配的 Asset；该 Revision 仍不可直接部署。
5. 运营人员选择 Revision 发起预览。API 再次校验 Asset，并创建 Deployment；Worker 按固定模板构建，写入不可变 artifact 路径。
6. 部署适配器把对应 artifact 暴露为 `https://{siteId}.preview.{platformDomain}`，检查 HTTPS 首页、产品/资质/关于/联系路由及关键静态资源；全部通过后才标记为 `healthy` 并记录 URL。Phase 3 再承诺自动重试、原子回滚和故障演练。

真实环境前置条件由部署配置显式提供并验证：平台域名、`*.preview.{platformDomain}` DNS、泛域名 HTTPS 证书、OSS/CDN 绑定和所在地合规状态。没有这些配置时只能运行本地/测试构建，部署接口必须返回可行动的配置错误。

## 风险与回滚

- 真实素材可能涉及版权、商标、产品参数和二维码账号错误。采用清单、来源/批准记录及复核人责任字段；未确认时仅使用中性占位。
- 直传若未限制对象键或 Content-Type，可能造成跨站写入或恶意文件。签名必须限制前缀、大小、类型和时间，完成端必须复核实际对象。
- 仅依赖 MIME 可被伪造。对图片验证受控解码、对 PDF 验证魔数和可读取性；解析失败即拒绝。
- 平台域名、证书、ICP 或 CDN 尚未就绪时无法声称完成 HTTPS 预览。将它们作为部署验收前置条件，并保留明确阻塞状态。
- 新表和外键 migration 存在升级风险。先在独立 MySQL 测试库演练，migration 仅追加；生产执行前备份并记录回滚脚本。已创建的 Asset/Artifact 不原地修改，错误对象以状态变更和延迟清理处理。
- Phase 2 仅承诺首次预览的 HTTPS、路由与关键资源健康检查；自动重试、原子回滚和故障演练移交 Phase 3，避免把未验证行为宣传为可恢复发布。

## 必须同步的长期文档

- [x] `README.md`：更新当前阶段与 Phase 2 活跃 Spec 入口。
- [x] `docs/展站计划.md`：更新 Phase 2 进展、素材状态和预览基础设施的事实状态。
- [x] `docs/展站-产品需求文档(PRD).md`：同步 Asset 规则、预览流程、接口/验收标准中的稳定结论。
- [x] `docs/guides/DATABASE.md`：增加 Asset、BuildArtifact、Deployment 结构、约束、migration 运维与 MySQL 集成测试说明。
- [x] `docs/guides/DEV_GUIDE.md`：增加 OSS/预览所需环境变量、本地运行、独立 Worker 和测试命令。
- [x] `docs/guides/DEPLOYMENT.md`：已新增并如实记录域名、DNS、证书、OSS/CDN、地域/备案的待验证状态。
- [x] `deploy/README.md`：已新增并记录 migration、API 与独立 Worker 运行入口。
- [x] `docs/jinyuan/README.md` 与 `docs/jinyuan/金源电器官网-产品需求文档(PRD).md`：同步真实素材清单、待确认项及批准占位项。

## 实施顺序

1. 建立并确认金源素材清单；收集真实文件或获得每个占位项的书面批准。
2. 明确 OSS bucket、区域、对象键策略、服务端凭据、preview 域名、DNS、证书和合规前置条件；提供本地/测试替代适配器。
3. 设计 Drizzle schema、追加 migration、仓库接口和 MySQL 集成测试基座。
4. 实现 Asset 直传签名、完成复核、同站归属/类型语义校验及审计。
5. 修正站点创建事务以生成 revision 1，并在 Revision 草稿保存与部署创建路径分别接入分级 Asset 校验；补齐 AC-01～AC-03 与 Asset API 测试。
6. 实现后台素材、Revision 历史/冲突恢复和预览任务界面，并编写交互测试。
7. 实现 Worker/构建 artifact/preview 部署适配器、幂等部署与健康检查，在受控测试环境验证 HTTPS URL、P95 与静态站独立性。
8. 运行全量质量检查、MySQL 集成测试、构建及预览 smoke test；回写长期文档后归档 Spec。
