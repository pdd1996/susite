# Phase 2：素材与预览 Spec

| 项目 | 内容 |
| --- | --- |
| 状态 | 进行中 |
| 创建日期 | 2026-07-15 |
| 完成日期 | — |
| 负责人 | 展站项目 |
| 关联长期文档 | 展站 PRD、展站计划、SiteConfig v1 Schema、数据库设计、开发指南、金源 PRD 与金源 README |

## 背景

Phase 1 已建立站点、不可变 `SiteRevision`、最小 MySQL 持久化、固定模板及后台版本历史基线，但尚未实现真实素材的登记、归属与类型校验、OSS 直传、不可变构建产物和 HTTPS 预览。当前金源的 Logo、产品图、证书图、PDF 与二维码均未在仓库中核验为可交付素材，现有 fixture 中的 Asset ID 仅是 Phase 1 的结构占位。

Phase 2 需要让内部运营人员以经过复核的真实素材，或已明确批准且可追踪的占位素材，完成一次可分享的标准预览交付；同时把素材约束落实到 Revision 保存、构建和部署的服务端边界。

## 目标

- 建立金源首站的素材清单、来源、版权/使用确认、复核状态与占位替代策略；
- 引入不可变 `Asset` 记录：素材必须归属同一 `siteId`、完成复核且与 SiteConfig 引用位置的类型匹配；
- 实现浏览器直传 OSS 的短时签名与服务端完成复核，密钥不进入浏览器；
- 按 `revision + templateVersion` 生成不可变 `BuildArtifact`，并部署到平台 HTTPS 预览域名；
- 在后台提供素材上传状态、Revision 历史、冲突提示和重新加载最新版本的可验证交互；
- 增加真实 MySQL 集成测试，以及后台 Revision 历史/冲突交互测试。

## 非目标

- 客户正式域名、DNS 代管、ICP备案流程和生产环境发布；
- Phase 3 的失败重试、原子回滚、完整部署日志和故障演练；Phase 2 仅实现首次预览所需的 HTTPS、路由和关键静态资源健康检查；
- 客户自助账号、多租户模型、客户直接上传或客户审核人登录后台；
- 任意文件格式、富媒体编辑、在线图片处理或素材跨站复用；
- 以虚构的“真实”金源素材替代客户确认的文件。

## 素材清单与占位策略

所有清单记录存放于本次实施新增的受版本控制清单（建议 `docs/jinyuan/assets-manifest.md`）；二进制文件不提交到代码仓库。每项必须记录：`assetId`、用途、所需类型、文件要求、来源/授权或确认人、复核人、状态、OSS 对象键、校验和和替代方案。未提供或未核验的项目一律标为“待确认”，不得写为已交付。

| 素材类别 | SiteConfig 引用位置 | 可接受类型与上限 | 当前状态 | 允许的占位策略 | 发布前要求 |
| --- | --- | --- | --- | --- | --- |
| Logo | `brand.logoAssetId` | SVG、PNG、WebP；单文件 ≤ 2 MB | 待客户提供与品牌确认 | 使用带“示例 Logo”文字、非客户商标的 SVG；不得仿制客户标识 | 必须为同站点已复核的 `logo` 类型；占位须获运营负责人明确批准并在预览页/审核记录标识 |
| 产品图 | `products.categories[].series[].imageAssetId` | JPEG、PNG、WebP；单文件 ≤ 5 MB | 待客户提供/拍摄与产品型号映射确认 | 使用通用工业器材图或项目生成中性占位图；不得暗示具体型号、认证或性能 | 必须为同站点已复核的 `product_image` 类型；每个使用占位图的产品在清单中列出 |
| 证书图 | `assets.certificates[]` 与 `certifications.groups[].items[]` | JPEG、PNG、WebP；单文件 ≤ 5 MB，合计最多 30 张 | 待客户提供原件及有效性确认 | 使用“资质文件待补充”卡片，不展示伪造证书、证书编号或认证标识 | 必须为同站点已复核的 `certificate_image` 类型；真实证书应核对名称、有效期与展示许可 |
| 产品 PDF | `assets.pdfCatalogAssetId` | PDF；单文件 ≤ 50 MB | 待客户提供可公开分发版本 | 不生成伪造产品目录；隐藏下载入口并在运营清单标记缺失 | 必须为同站点已复核的 `product_pdf` 类型；上传后校验 PDF 魔数、页数可读取和下载权限 |
| 微信二维码 | `contact.wechatQrAssetId` | PNG、JPEG、WebP；单文件 ≤ 2 MB | 待客户提供并扫码确认 | 使用“联系信息待确认”静态卡片；不得生成指向未经授权账号的二维码 | 必须为同站点已复核的 `wechat_qr` 类型；复核人实际扫码并记录目标账号/确认日期 |
| 厂房图 | `about.factoryImageAssetIds[]` | JPEG、PNG、WebP；单文件 ≤ 5 MB，最多 10 张 | 待客户提供并确认拍摄场所 | 使用明确标注“示意图”的中性工业场景图，或隐藏厂房图片区块；不得冒充客户厂区 | 必须为同站点已复核的 `factory_image` 类型；每张占位图均须单独记录批准状态 |

占位资产也必须上传并登记为 `sourceKind=placeholder`，批准状态由独立的批准人和批准时间字段表达；真实素材使用 `sourceKind=customer_provided`。两种来源受同样的站点归属、MIME、大小、校验和和不可变性约束。预览发布前，服务端输出本 Revision 所引用的占位资产清单；运营人员只有在所有占位项已获批准时才能继续。正式发布不在本 Spec 范围内，且不得将本策略视为正式交付豁免。

## 影响范围

- 产品：Phase 2 落地“素材与预览”能力，预览仍仅限平台域名和内部运营交付。
- 配置契约：不改变 SiteConfig v1 字段；保存草稿 Revision 时允许尚不存在的预留 Asset ID，但已存在的 Asset 必须属于同一站点且类型匹配；创建部署时要求全部引用存在、完成复核、归属同站、类型匹配且占位项已批准。
- 数据库：新增 `assets`、`build_artifacts`、`deployments` 及其外键、唯一性和审计记录；为 MySQL 提供可重复执行的 Phase 2 migration。
- API：新增上传签名、素材完成登记、预览构建/部署状态查询接口；Revision 创建的错误响应补充可定位的 Asset 校验问题。
- 模板 / 后台：模板从已登记 Asset 的安全 URL 读取资源；后台增加上传、素材状态、Revision 历史与冲突恢复交互。
- 基础设施：增加 OSS bucket/prefix、最小权限服务端凭据、构建产物路径、preview CDN/域名/泛域名证书配置。
- 测试：增加 MySQL 集成测试、Asset 语义校验测试、构建/预览流程测试和后台交互测试。
- 文档：完成后回写 PRD、项目计划、数据库设计、开发指南、部署指南和金源素材状态。

## 验收标准

- [ ] 金源素材清单覆盖 Logo、产品图、证书图、产品 PDF、微信二维码和厂房图；每项均有状态、来源/确认信息、复核要求和占位策略，未核验项明确标为待确认。
- [ ] AC-01～AC-03 回归通过：已登录运营人员创建站点后在同一事务中获得唯一 `siteId`、revision 1 与审计记录；非法配置准确定位字段；两个客户端基于同一 Revision 保存时仅第一个成功，第二个收到 `409 revision_conflict`。
- [ ] 保存草稿 Revision 时，尚不存在的预留 Asset ID 可以保留；已存在但跨站或类型不匹配的 Asset 被拒绝。创建部署时，任何不存在、未复核、跨站、类型不匹配或未经批准的占位 Asset 都必须被拒绝。
- [ ] 上传流程由服务端签发短时、限定对象键/Content-Type/大小的 OSS 直传凭据；完成接口复核对象存在性、大小、MIME/文件特征、checksum 和归属后才创建不可变 Asset 记录，客户端不接触长期 OSS 密钥。
- [ ] 后台能显示上传进度、复核状态、真实/占位标记及失败原因；占位素材须显示批准状态，未批准占位素材不能触发预览。
- [ ] 指定有效 Revision 与模板版本可生成不可变 `BuildArtifact`；产物和资源置于 revision/artifact 专属路径，携带相同幂等键的重复部署请求只返回同一有效任务，不得覆盖或创建重复有效 artifact。
- [ ] 在已配置的非生产平台域名、泛域名 DNS 和有效 HTTPS 证书条件下，可取得格式为 `https://{siteId}.preview.{platformDomain}` 的预览 URL；部署仅在 HTTPS 首页、产品/资质/关于/联系路由及关键静态资源检查通过后标为 `healthy`，且标准配置连续 20 次部署的 P95 不超过 10 分钟。
- [ ] 已部署的预览为纯静态 artifact：在 API 不可用时仍可浏览；在 iOS 16+ 与 Android 12+ 微信内置浏览器真机检查中可打开链接、使用拨号与下载 PDF。
- [ ] 域名注册、DNS、证书、ICP/地域合规状态在部署指南中按“已验证”或“阻塞/待确认”如实记录；未满足前置条件时部署返回明确的不可发布状态，而非伪造 HTTPS 链接。
- [ ] MySQL 集成测试在独立测试库中执行 migration，验证 Asset 外键/归属约束、Revision 条件更新冲突、审计记录及 Phase 2 核心查询；测试不依赖开发数据库。
- [ ] 数据库可靠性修复完成：Drizzle schema 与 SQL 约束一致；Deployment 只能引用同站点同 Revision 的 Artifact；Artifact 与 Deployment 的租约写入使用 fencing token 拒绝过期 Worker；迁移由带 checksum/version journal 的统一入口执行。
- [ ] `docs/guides/DATABASE.md` 包含 MySQL 8.0.16+ 的物理表设计、约束/索引、字符集与 UTC 契约、本机从零建库、迁移、验收和失败恢复步骤。
- [ ] 后台交互测试覆盖 Revision 列表加载、选择历史 Revision、两次并发保存导致的 `409 revision_conflict`、提示当前服务端版本及重新加载最新版本后恢复编辑；不会静默覆盖本地编辑内容。
- [ ] `pnpm check`、`pnpm test`、`pnpm build` 通过；在具备受控云测试凭据时，预览 smoke test 成功并保留可审计的结果。

## 验证结果

- 自动化测试：`pnpm check` 通过；SiteConfig 6 项、API 12 项、模板 2 项、后台 3 项测试通过。MySQL 8 集成测试已真实执行 migration journal、复合外键、并发领取/预留和 fencing token 验证。
- 构建：`pnpm build` 通过；后台与固定模板均生成生产构建。
- 格式检查：`git diff --check` 通过。
- 本地验收：完成站点 + revision 1、Asset 分级校验、签名上传/服务端复核、上传完成幂等、Deployment 幂等、artifact 构建适配器、路由/关键资源健康检查、Revision 历史与冲突恢复交互验证。
- 尚未完成：金源真实素材或逐项批准占位、受控 OSS、平台预览域名/DNS/证书、真实 HTTPS smoke test、20 次部署 P95、API 停止后的线上静态访问、微信真机和 MySQL 实际集成测试。独立 Worker 进程入口已实现，但尚未在受控云环境运行。因此本 Spec 保持活跃，不归档。
