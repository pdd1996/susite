# 从金源 Demo 迁移到展站 V1

| 项目 | 内容 |
| --- | --- |
| 状态 | Phase 1 迁移设计基线 |
| 关联文档 | [展站 PRD](./展站-产品需求文档(PRD).md) · [SiteConfig v1 Schema](./schemas/site-config-v1.schema.json) · [ADR-0001](./adr/ADR-0001-doc-authority.md) |

## 目的与边界

本文说明如何将 `jinyuan-mvp` 的配置驱动原型迁移为展站 V1。它只定义数据和运行模型的差异，不代表现有 Demo 已具备 V1 平台能力。

原型的权威配置文件是 `jinyuan-mvp/public/site.config.json`；V1 的内容契约以 [SiteConfig v1 JSON Schema](./schemas/site-config-v1.schema.json) 为准。

## 核心差异

| 维度 | 金源 Demo | 展站 V1 |
| --- | --- | --- |
| 配置存储 | `site.config.json`，浏览器可用 localStorage 覆盖 | 数据库中的不可变 `SiteRevision` |
| 配置校验 | TypeScript 类型和前端逻辑 | API 服务端按 Schema 校验 |
| 素材 | URL、Base64 或 `null` | 先直传 OSS，复核后以不可变 `assetId` 引用 |
| 发布 | 前端模拟状态 | 异步任务生成 `BuildArtifact` 后部署 |
| 状态 | 一个 `status` 与 `deploy` 混合表达 | 内容、部署、域名、备案状态相互独立 |
| 回滚 | 无真实 artifact | 原子切换到历史健康 artifact |

## 字段映射

| Demo 字段 | V1 字段 | 迁移规则 |
| --- | --- | --- |
| `siteId` | `Site.siteId`、`SiteRevision.siteId` | 原值可沿用；服务端检查唯一性 |
| `template` | `Site.template`、`SiteRevision.template` | 固定为 `b2b-manufacturing-v1` |
| `status` | `contentStatus` | `draft` 保持为 `draft`；其他状态需人工映射 |
| `brand.name` | `brand.name` | 直接迁移 |
| `brand.primaryColor` | `brand.primaryColor` | 直接迁移，必须为 6 位 Hex |
| `brand.logoMark`、`shortName`、`tagline`、`subtitle` | 模板扩展字段，暂不进入 V1 契约 | 先由模板默认值或 `home.hero` 承接；需要保留时先升级 Schema |
| `contact.wechatQrUrl` | `contact.wechatQrAssetId` | 上传二维码后替换为对应 Asset ID |
| `assets.logoUrl` | `brand.logoAssetId` | 上传 Logo 并以对应 Asset ID 替换 |
| `assets.pdfCatalogUrl` | `assets.pdfCatalogAssetId` | 上传 PDF 并以对应 Asset ID 替换 |
| `assets.certificates[].url` | `assets.certificates[].assetId` 与 `certifications.groups` | 上传每张证书；按 `group` 生成认证分组 |
| `content.aboutText` | `about.introduction` | 直接迁移 |
| `content.values[].title` | `home.principles`、`about.principles` | 提取标题数组，两个区块使用相同值 |
| `content.advantages[].title` | `home.strengths` | 提取标题数组；描述暂不在 V1 契约中 |
| `content.industries` | `about.industries` | 直接迁移 |
| `content.productCategories[].desc` | `products.categories[].summary` | 字段改名 |
| `content.productCategories[].series[].tagline` | `products.categories[].series[].sellingPoint` | 字段改名；补充稳定 `id` |
| `content.certPreview` | `home.featuredCategoryIds` | 语义不等价，需人工决定首页精选产品分类 |
| `deploy.*` | `Deployment`、`BuildArtifact` | 不迁移；由 V1 构建流程重新生成 |

## 迁移步骤

1. 创建 `Site`，保留已确认的 `siteId` 与模板名。
2. 将原型中的 Logo、二维码、PDF、证书和产品图上传到 OSS；完成 MIME、大小、归属校验后创建 `Asset` 记录。
3. 按上表转换内容字段；处理所有 `null` 素材引用，不可将 `null` 写入 V1 必填 Asset ID。
4. 为产品分类和系列补充稳定 ID，并人工确认首页精选分类。
5. 通过 Schema 与服务端业务规则校验，创建 revision 1；服务端同时验证 Asset 类型和 `siteId` 归属。
6. 用固定模板从该 revision 构建 artifact，健康检查通过后创建预览部署。
7. 保留原型配置为迁移输入记录，但不再作为运行时事实来源。

## 不自动迁移的内容

- 浏览器 `localStorage` 中的临时编辑内容；
- 模拟预览 URL、模拟部署时间和正式环境状态；
- `null` 或未复核素材；
- 未进入 V1 配置契约的自由字段；
- 任意 HTML、脚本或富文本内容。

## 待确认项

- 首页的精选产品分类；
- 需要保留的品牌短名、标语和副标题是否应成为 V1 契约字段；
- PDF、Logo、产品图、证书与二维码的正式素材及其版权/使用授权；
- 平台预览域名与中国大陆部署的备案策略。
