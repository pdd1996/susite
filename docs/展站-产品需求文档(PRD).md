# 展站（ZhanSite）— 产品需求文档（PRD）

| 项目 | 内容 |
|------|------|
| **文档版本** | v1.4 |
| **创建日期** | 2026-05-24 |
| **修订日期** | 2026-07-15 |
| **产品名称** | 展站（ZhanSite） |
| **产品定位** | 面向 B2B 企业的配置驱动展示站生成与发布平台（AI Agent 为后续能力） |
| **文档状态** | MVP 收敛修订稿 · 待评审 |
| **首个样板客户** | 杭州金源电器有限公司（`jinyuan-mvp`） |

---

## 修订记录

| 版本 | 日期 | 修订人 | 说明 |
|------|------|--------|------|
| v1.0 | 2026-05-24 | — | 初稿，基于 Agent 建站方案与金源 MVP 实践 |
| v1.1 | 2026-07-14 | — | 收敛内部运营 MVP；重构状态、权限、数据、API 与验收标准 |
| v1.2 | 2026-07-15 | — | 记录 Phase 0 核验结果，纠正金源文档、源码与构建状态 |
| v1.3 | 2026-07-15 | — | 定稿 V1 技术栈、身份认证、消息队列、日志与 Hono 部署方式 |
| v1.4 | 2026-07-15 | — | 统一平台域名、V1 Agent 边界与 IDaaS 登录表述 |

---

## 0. 产品命名

### 0.1 推荐名称：**展站（ZhanSite）**

| 维度 | 说明 |
|------|------|
| **中文** | 展站 — 「展示站」缩写，贴合 B2B 销售展示场景 |
| **英文** | ZhanSite — 便于域名、仓库、API 命名（如 `zhan.site`） |
| **Slogan** | 配置做站，一键展给客户 |

### 0.2 备选名称

| 名称 | 优点 | 缺点 |
|------|------|------|
| **站派 SitePilot** | 强调 AI Agent 引导 | 「派」字品牌感略弱 |
| **企门面 BizFront** | 直指 B2B 门面需求 | 偏口语，国际化一般 |
| **锚站 AnchorSite** | 有「建立信任」隐喻 | 认知成本略高 |

### 0.3 与现有仓库的关系

| 仓库 / 项目 | 角色 |
|-------------|------|
| **展站平台**（待建） | V1 内部运营后台、配置版本、上传与预览部署；Agent 后置 |
| **jinyuan-mvp**（已核验） | 第一个站点模板和样板客户交付物；已完成生产构建 |
| **金源 PRD / 设计规范**（已核验） | `docs/jinyuan/` 下已有 4 份 Markdown 文档；PDF、图片与 Canvas 资产仍待补齐 |

---

## 1. 项目背景

### 1.1 背景说明

大量 B2B 企业（制造、贸易、服务等）需要 **正式、专业、可在微信中转发** 的线上门面，用于销售拜访、客户信任建立与资料触达。传统建站存在：

- 沟通周期长、改稿成本高
- 外包交付后小改仍依赖开发
- 预览与正式上线流程割裂
-  Logo、证书、PDF 等素材分散，缺少统一入口

**展站** 通过 **结构化配置 + 统一管理后台 + 自动化部署**，让内部运营人员在较短时间内完成「可演示预览」；AI 对话采集是后续能力，不属于 V1。

### 1.2 V1 产品假设

V1 首先服务 **展站运营 / 交付人员**，验证固定模板是否能显著降低单个 B2B 官网的交付时间。V1 不是客户自助 SaaS，也不将 Agent 产品化。

### 1.3 项目目标与口径

| 目标 | 指标 | V1 目标值 | 统计口径 |
|------|------|-----------|----------|
| 快速配置 | 首次可发布配置耗时 | 素材齐全后 ≤ 60 分钟 | 从创建站点到首次触发部署 |
| 快速预览 | 预览部署耗时 | P95 ≤ 10 分钟 | 从部署请求受理到 HTTPS 健康检查通过 |
| 稳定发布 | 预览部署成功率 | ≥ 95% | 排除第三方平台不可用，按部署任务统计 |
| 降低人力 | 单站人工交付工时 | ≤ 4 小时 | 不含客户素材等待与备案 |
| 客户确认 | 首版预览确认率 | ≥ 60% | 无结构性改版即可进入文案/素材微调 |
| 可恢复 | 发布可追踪与回滚 | 100% | 每次部署关联 revision、artifact 和日志 |

### 1.4 非目标（V1 不做）

- 通用任意类型网站（博客、电商、社区）
- 在线商城 / 在线支付
- 复杂 CMS（富文本新闻、多角色权限）
- 客户自助注册、客户后台与多角色协作
- 产品化 AI Agent 对话入口（内部可继续使用 Cursor 辅助整理内容）
- 客户正式域名绑定、DNS 自动检测与 ICP 流程管理
- 完整 SEO 运营、访问分析与广告投放
- CRM / ERP 对接
- 访客在官网上传文件

---

## 2. 用户与场景

### 2.1 目标用户

| 用户角色 | 典型身份 | 核心诉求 |
|----------|----------|----------|
| **Primary — 展站运营 / 交付** | 内部运营人员 | 创建站点、录入内容、上传素材、发布和回滚预览 |
| **Reviewer — 企业主 / 市场负责人** | 客户决策人 | 通过预览链接确认内容与视觉，不登录后台 |
| **Viewer — 销售及其客户** | 官网终端访客 | 在微信中快速浏览、拨号、下载 PDF |

### 2.2 V1 权限边界

V1 仅提供内部运营账号。所有写操作必须鉴权并记录操作者、时间、siteId 和变更 revision。

| 操作 | 内部运营 | 客户审核人 | 官网访客 |
|------|----------|------------|----------|
| 创建、编辑站点 | 允许 | 不允许 | 不允许 |
| 上传与删除素材 | 允许 | 不允许 | 不允许 |
| 发布、回滚预览 | 允许 | 不允许 | 不允许 |
| 查看预览链接 | 允许 | 允许 | 获得链接后允许 |
| 浏览正式站点 | 允许 | 允许 | 允许 |

### 2.3 核心使用场景

**场景 A：创建与配置站点**
> 运营人员根据客户访谈结果创建站点，通过结构化表单填写公司、产品、联系方式和品牌信息；系统校验后生成一个配置 revision。

**场景 B：后台上传素材**
> 运营人员上传 Logo、证书、微信二维码、产品图片和 PDF；文件直传对象存储，配置仅引用不可变资源 URL。

**场景 C：预览确认**
> 运营人员触发预览部署，系统生成 revision 对应的静态 artifact 和 HTTPS URL；客户在手机或微信中审核。

**场景 D：小改与回滚**
> 修改内容后产生新 revision 并重新部署；如新版本异常，可回滚到上一个成功 artifact。

---

## 3. 产品范围

### 3.1 系统组成

```
展站（ZhanSite）V1
├── 内部运营后台          站点、内容、素材、revision 与发布
├── API 与任务层          鉴权、配置、签名上传、异步部署任务
├── 构建与预览层          revision + 模板 → artifact → preview
└── 站点模板库            B2B 制造展示站（V1 仅 1 套）
```

产品化 Agent、客户自助后台、正式域名与备案管理属于后续阶段，不进入 V1 验收。

### 3.2 管理后台信息架构

```
展站管理后台
├── 内部账号登录 / 站点列表
├── 站点详情
│   ├── 基本信息          公司名、电话、地址、主色、模板类型
│   ├── 上传中心          Logo / 二维码 / 证书 / 产品图 / PDF
│   ├── 内容与页面        产品分类、关于我们文案（表单或 JSON）
│   ├── 预览与发布        revision、任务状态、预览链接、日志
│   └── 版本记录          历史 revision、artifact 与回滚
└── 系统设置              内部账号与模板版本
```

### 3.3 生成站点信息架构（V1 模板）

与 `jinyuan-mvp` 对齐，单模板默认 **5～10 页**：

```
企业展示站（制造/B2B）
├── 首页                    /
├── 产品中心                /products (+ 分类子页)
├── 资质认证                /certifications
├── 关于我们                /about
└── 联系我们                /contact
```

### 3.4 V1 交付物定义

| 阶段 | 交付物 | 说明 |
|------|--------|------|
| **配置完成** | 通过配置契约校验的 SiteRevision | 包含字段值与不可变素材引用 |
| **预览交付** | HTTPS 预览 URL + 二维码 | 统一格式：`https://{siteId}.preview.{platformDomain}` |
| **发布记录** | Deployment + BuildArtifact + 日志 | 可查询、可重试、可回滚 |

---

## 4. 功能需求

### 4.1 站点与版本

| 编号 | 需求 | 优先级 | 说明 |
|------|------|--------|------|
| F-A01 | 创建站点 | P0 | 自动生成唯一 `siteId`，V1 固定模板 `b2b-manufacturing-v1` |
| F-A02 | 结构化配置编辑 | P0 | 编辑品牌、联系方式、产品、资质与页面文案 |
| F-A03 | 配置契约校验 | P0 | 保存前校验必填、格式、长度、数量与资源类型；服务端为最终边界 |
| F-A04 | 配置 revision | P0 | 每次有效保存生成递增 revision，历史版本不可修改 |
| F-A05 | 并发保护 | P0 | 更新时携带当前 revision；版本冲突返回明确错误，不静默覆盖 |
| F-A06 | 版本对比与回滚 | P1 | 可查看历史 revision，并基于历史版本创建新 revision |

### 4.2 内部运营后台

| 编号 | 需求 | 优先级 | 说明 |
|------|------|--------|------|
| F-B01 | 站点列表与搜索 | P0 | 按公司名、siteId、更新时间搜索 |
| F-B02 | 基本信息编辑 | P0 | 公司名、电话、传真、地址、主色 |
| F-B03 | Logo 上传 | P0 | 单张，建议 PNG/SVG，≤ 2MB |
| F-B04 | 微信二维码上传 | P0 | 单张，≤ 2MB |
| F-B05 | 证书批量上传 | P0 | 最多 30 张，支持命名、排序和删除 |
| F-B06 | PDF 样本册上传 | P0 | 单文件，≤ 50MB，用于全站下载按钮 |
| F-B07 | 产品图上传 | P0 | 最多 100 张，可按产品或分类关联 |
| F-B08 | 预览链接展示 | P0 | 可复制、生成二维码并显示对应 revision |
| F-B09 | 发布预览 | P0 | 触发异步构建与部署，防止重复提交 |
| F-B10 | 部署详情 | P0 | 展示 job、artifact、耗时、状态、错误与日志 |
| F-B11 | 重试与回滚 | P0 | 失败任务可安全重试；可重新部署历史成功 artifact |
| F-B12 | 审核留痕 | P0 | 按 revision 记录预览发送、客户反馈、确认渠道、备注和操作者 |

### 4.3 上传与存储

| 编号 | 需求 | 优先级 | 说明 |
|------|------|--------|------|
| F-C01 | 签名上传 | P0 | 后端签发短时、限定路径/类型/大小的上传凭证 |
| F-C02 | 浏览器直传 OSS | P0 | 文件不经过应用服务器，密钥不下发客户端 |
| F-C03 | 不可变资源键 | P0 | 对象键包含 siteId、资源 ID 或校验和；替换生成新 URL |
| F-C04 | 双重校验 | P0 | 客户端预检，服务端/存储侧复核 MIME、扩展名与大小 |
| F-C05 | 资源记录 | P0 | 保存 assetId、siteId、type、URL、大小、校验和、操作者与时间 |
| F-C06 | 安全删除 | P1 | 先解除 revision 引用；物理文件延迟清理，避免破坏历史 artifact |

### 4.4 构建与部署

| 编号 | 需求 | 优先级 | 说明 |
|------|------|--------|------|
| F-D01 | 确定性构建 | P0 | `templateVersion + revision → artifactId + dist/` |
| F-D02 | 异步任务 | P0 | 部署请求立即返回 `jobId`；任务可查询、可重试、具备幂等键 |
| F-D03 | 预览自动部署 | P0 | 统一输出 `https://{siteId}.preview.{platformDomain}`；`platformDomain` 在注册后确定 |
| F-D04 | 不可变 artifact | P0 | 构建成功后产物不可修改，并记录来源 revision 与模板版本 |
| F-D05 | 健康检查 | P0 | HTTPS、首页、关键路由与关键静态资源均可访问才算成功 |
| F-D06 | 原子切换与回滚 | P0 | 预览地址仅指向完整成功 artifact；失败不覆盖当前可用版本 |
| F-D07 | 日志与错误分类 | P0 | 区分校验、构建、上传、部署、健康检查错误，日志不泄露密钥 |

### 4.5 生成站点（终端用户可见）

| 编号 | 需求 | 优先级 | 说明 |
|------|------|--------|------|
| F-E01 | 移动端适配 | P0 | 微信内置浏览器可用 |
| F-E02 | 一键拨号 | P0 | 联系页 `tel:` 链接 |
| F-E03 | PDF 下载 | P0 | 全站固定入口；缺少 PDF 时不展示空链接 |
| F-E04 | 无后端运行时 | P0 | 纯静态，无 API 依赖 |
| F-E05 | 首屏加载 | P0 | 移动端 4G、冷缓存条件下 P75 LCP ≤ 3 秒 |
| F-E06 | 基础可访问性 | P1 | 图片 alt、键盘焦点、语义标题、文本对比度满足基础检查 |

---

## 5. 核心数据模型与配置 Schema

### 5.1 数据实体

| 实体 | 作用 | 关键字段 |
|------|------|----------|
| `Site` | V1 的站点身份与当前指针 | siteId、name、template、currentRevision |
| `SiteRevision` | 不可变配置快照 | siteId、revision、schemaVersion、config、createdBy |
| `Asset` | 不可变素材记录 | assetId、siteId、type、url、size、checksum |
| `BuildArtifact` | V1 预览环境的不可变静态构建产物 | artifactId、revision、templateVersion、location |
| `Deployment` | 一次预览部署任务 | deploymentId、jobId、artifactId、environment、status、error |
| `ReviewRecord` | 客户预览审核的内部留痕 | reviewId、siteId、revision、outcome、channel、note、recordedBy、recordedAt |
| `AuditLog` | 写操作审计 | actorId、action、siteId、targetId、timestamp |

### 5.2 SiteRevision 配置示例

```yaml
schemaVersion: "1.0"
siteId: jinyuan-20260524
revision: 3
template: b2b-manufacturing-v1
templateVersion: "1.0.0"

brand:
  name: 杭州金源电器有限公司
  primaryColor: "#C41E3A"
  logoAssetId: asset_logo_01

contact:
  phone: "0571-86817925"
  fax: "0571-86817927"
  address: 杭州市莫干山路1418-5号2幢4032
  wechatQrAssetId: asset_qr_01

assets:
  certificates:
    - { name: 营业执照, assetId: asset_cert_01, order: 1 }
    - { name: ISO 9001, assetId: asset_cert_02, order: 2 }
  pdfCatalogAssetId: asset_pdf_01

home:
  hero:
    title: 杭州金源电器有限公司
    summary: 专注互感器研发制造
  principles: [以质量求生存, 以科技求发展, 以管理求效益, 以服务求信誉]
  strengths: [国标生产, 可按要求定制, 完整检测体系]
  featuredCategoryIds: [lv-current, hv-current]

products:
  categories:
    - id: lv-current
      slug: lv-current
      name: 低压电流互感器
      summary: 适用于低压配电与测量场景
      series:
        - { id: lmk1-bh, name: "LMK1(BH)-0.66", sellingPoint: 开启式结构，免拆线安装, imageAssetId: asset_product_01 }

certifications:
  groups:
    - name: 企业资质
      items: [{ name: 营业执照, assetId: asset_cert_01 }]

about:
  introduction: 专业生产互感器产品，服务电力与成套设备行业。
  principles: [以质量求生存, 以科技求发展, 以管理求效益, 以服务求信誉]
  industries: [电网, 光伏, 风电, 工业]
```

部署信息不写入 SiteRevision，避免内容配置与运行状态相互覆盖。

### 5.3 SiteConfig v1 内容契约

`config` 必须包含以下结构化内容；模板只渲染该契约允许的字段，不接受任意 HTML、脚本或未定义页面结构。

| 区块 | 必填字段 | 约束 |
|------|----------|------|
| `brand` | `name`、`primaryColor`、`logoAssetId` | 公司名 1～100 字；颜色为 Hex；Logo 必须是图片 Asset |
| `contact` | `phone`、`address` | 电话 3～30 字；地址 1～200 字；`fax`、`wechatQrAssetId`、`mapUrl` 可选 |
| `home` | `hero.title`、`hero.summary`、`principles`、`strengths` | 标题 ≤ 100 字，摘要 ≤ 300 字；理念 1～4 项，优势 1～6 项 |
| `products` | `categories` | 分类 1～10 个；分类 `id` 与 `slug` 均唯一；每项含 `id`、`slug`、`name`、`summary`、`series`；系列 1～30 项，均含名称、卖点和可选图片 Asset |
| `certifications` | `groups` | 分组 0～10 个；每组含名称与有序证书引用；全站证书最多 30 张 |
| `about` | `introduction`、`principles`、`industries` | 简介 ≤ 2,000 字；理念 1～4 项；行业 0～12 项；厂房图可选 |
| `assets` | `pdfCatalogAssetId`（可选） | 仅可引用同一 `siteId` 下、已完成复核且类型匹配的 Asset |

产品路由根据分类 `slug` 生成；首页精选产品必须引用已有分类 `id`，证书通过对应 `id` 引用。必填文本不得为空白。文本使用受限的纯文本与换行格式，不提供富文本编辑器。字段的精确 JSON Schema、枚举和迁移规则与 `schemaVersion` 一同维护；当前基线为 [`site-config-v1.schema.json`](./schemas/site-config-v1.schema.json)，代码仓建立后将同步至共享 `site-config` 包。

### 5.4 配置契约与服务端校验

`schemaVersion` 是配置契约版本。当前 JSON Schema 是跨团队交换与评审基线；分类唯一性与精选分类引用通过 Schema 中声明的仓库 Ajv 扩展关键字校验。V1 代码实现使用 Zod 定义运行时 Schema 并推导 TypeScript 类型，前端、API、Worker 与模板共享同一 `site-config` 包，且必须满足：

- 服务端是最终校验边界，客户端校验仅用于改善编辑体验；
- Phase 1 仅对 Asset ID 做结构校验，允许草稿引用预留 ID；Phase 2 在素材复核和部署前必须验证 Asset 存在、类型匹配且属于同一 `siteId`，未通过时禁止部署；
- 每个 `schemaVersion` 明确字段、格式、数量和兼容规则；
- 不兼容变更必须升级版本，并提供旧 revision 的读取或迁移策略；
- 生成器仅接受已通过对应版本校验的不可变 revision。

### 5.5 内容审核与正交状态模型

不得使用一个 `status` 字段同时表达内容、部署、域名与备案。

| 维度 | 状态 |
|------|------|
| `contentStatus` | `draft` / `review_requested` / `approved` / `archived` |
| `deployStatus` | `queued` / `building` / `deploying` / `healthy` / `failed` |
| `domainStatus`（后续） | `unbound` / `dns_pending` / `active` / `failed` |
| `icpStatus`（后续） | `not_required` / `pending` / `filed` / `rejected` |

V1 的客户审核人不登录后台，也不直接改变系统状态。运营人员发出预览后创建 `ReviewRecord`，记录 `siteId`、`revision`、预览 URL、发送时间和渠道；收到客户确认或修改意见后，由运营人员将对应 revision 标记为 `approved` 或保持 `draft`，并记录确认渠道、备注、操作者和时间。审核记录不可修改，只能补充新记录。

V1 不定义 `Tenant` 实体或多租户隔离模型；正式生产环境是否复用 preview artifact，由 Phase 4 的发布设计另行决定。

---

## 6. 技术方案

### 6.1 总体架构

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│  管理后台 (Web)  │────▶│  API (Serverless) │────▶│  OSS / CDN  │
└─────────────────┘     └──────────────────┘     └─────────────┘
         │                        │
         │                        ▼
         │               ┌──────────────────┐
         └──────────────▶│  Build + Deploy   │
                         │  (CI / 脚本)      │
                         └──────────────────┘
                                    │
                                    ▼
                         ┌──────────────────┐
                         │  静态企业官网      │
                         │  Vite + React     │
                         └──────────────────┘
```

### 6.2 技术选型建议

| 层级 | 建议 | 说明 |
|------|------|------|
| Monorepo | pnpm workspace | 管理 apps、templates 与共享 packages；V1 不引入 Turborepo |
| 站点模板 | Vite + React + TypeScript + React Router + Tailwind CSS | 目标模板栈；现有 `jinyuan-mvp` 使用自定义 CSS，迁入时需评估是否迁移到 Tailwind。模板发布时预编译，站点发布不执行 npm install |
| 管理后台 | React + Vite + Tailwind CSS + Ant Design | Tailwind 负责布局与样式，Ant Design 仅提供后台复杂交互组件 |
| API | Hono + TypeScript + Zod | 作为标准 HTTP Server 运行；按业务域分层，不在路由中堆积业务逻辑 |
| API 运行环境 | 阿里云函数计算 Web 函数（自定义运行时） | 直接托管 HTTP Server，不依赖第三方 Hono-FC 适配器 |
| 异步任务 | TypeScript Worker + 阿里云函数计算（FC） | 由轻量消息队列（原 MNS）触发，执行 artifact 组装、健康检查与部署 |
| 存储与分发 | 阿里云 OSS + CDN | 素材、artifact、日志和预览静态站；国内微信访问优先 |
| 预览部署 | OSS 静态托管 + CDN | V1 仅平台 preview 环境，不依赖 Vercel |
| 元数据存储 | 阿里云 RDS MySQL + Drizzle ORM | 使用事务和条件更新保存 Site、Revision、Asset、Deployment、ReviewRecord 与审计日志 |
| 身份认证 | 阿里云 IDaaS EIAM + OIDC 授权码模式 | 托管内部账号与登录；API 校验身份并执行 site scope 授权 |
| 日志 | 阿里云日志服务 SLS | 收集 API、Worker、部署与安全审计日志，禁止记录密钥和完整 token |
| 测试 | Vitest + React Testing Library + Playwright | 单元、组件、配置契约与端到端测试 |
| 代码质量 | ESLint + Prettier | CI 中执行类型检查、lint、test 与 build |
| Agent（后续） | Cursor 辅助 → 自研对话 | 只能创建配置草稿，不绕过服务端配置校验与发布流程 |

### 6.2.1 平台域名与合规前置条件

- 平台运营方需注册并控制一个独立域名，用于 `https://{siteId}.preview.{platformDomain}`，不得占用客户正式域名；
- 在 DNS 中配置泛域名解析，并为 `*.preview.{platformDomain}` 申请和续期 HTTPS 证书；
- 若 OSS/CDN 使用中国大陆地域，平台域名须完成 ICP 备案后再对公众提供服务；未备案阶段仅可采用非中国大陆地域测试，且不承诺国内访问性能；
- 以上均可由普通组织或个人通过云服务商控制台完成，不要求自建云基础设施或成为云服务商。

### 6.3 关键 API 清单（MVP）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/sites` | 站点列表 |
| POST | `/sites` | 创建站点 |
| GET | `/sites/:id` | 站点详情与当前 revision |
| POST | `/sites/:id/revisions` | 基于 expectedRevision 创建新配置 revision |
| GET | `/sites/:id/revisions` | 查询版本历史 |
| POST | `/sites/:id/upload/sign` | 获取 OSS 直传签名 |
| POST | `/sites/:id/assets/complete` | 上传完成后登记并复核资源 |
| POST | `/sites/:id/deployments` | 按 revision 创建预览部署，返回 jobId |
| GET | `/sites/:id/deployments/:jobId` | 查询状态、artifact、错误与日志摘要 |
| POST | `/sites/:id/deployments/:jobId/retry` | 使用幂等键重试失败任务 |
| POST | `/sites/:id/rollback` | 将历史成功 artifact 原子切换为当前预览 |
| GET/POST | `/sites/:id/reviews` | 查询或新增预览发送、反馈与确认留痕 |

所有写接口必须鉴权、校验 site scope，并记录审计日志。部署创建与重试必须支持幂等键。

### 6.4 预览部署状态迁移

`queued → building → deploying → healthy`

任一步骤均可进入 `failed`。仅 `failed` 可重试；重试创建新的 Deployment 记录并关联原任务。发布失败不得覆盖当前健康版本。

每个 artifact 上传至不可变路径，且静态资源使用内容 hash。健康检查通过后才替换预览站点的单一入口文件（`index.html` 或入口清单）；入口禁止 CDN 长缓存并在切换时刷新，带 hash 的资源可长缓存。替换入口前不得删除旧 artifact，因此失败和中断不会使稳定预览指向半成品。

正式环境、域名和备案使用第 5.5 节的独立状态字段，在后续阶段单独定义迁移条件。

---

## 7. 安全与权限

| 项 | 要求 |
|----|------|
| 后台登录 | 仅内部账号；使用阿里云 IDaaS EIAM 的 OIDC 授权码模式，会话具备过期与撤销机制 |
| 授权 | 服务端校验角色与 site scope，前端隐藏按钮不能替代授权 |
| 上传鉴权 | 签名短时有效，限制对象路径、MIME、大小与单次操作；完成后再次复核 |
| 审计 | 创建、编辑、上传、删除、部署、重试、回滚均记录 actor、siteId、目标与时间 |
| 静态站 | 不执行用户提供的脚本或 HTML；文案必须转义，资源仅来自允许的 CDN |
| 密钥 | OSS 与部署密钥仅存于服务端环境变量；日志和错误响应不得输出密钥 |
| 隔离测试 | 至少包含跨 siteId 读取、修改、上传、部署均返回拒绝的自动化测试 |
| 预览访问 | V1 链接默认可分享；若内容敏感，后续增加过期 token 或访问密码 |

---

## 8. 项目里程碑

| 阶段 | 范围 | 退出条件 | 状态 |
|------|------|----------|------|
| **Phase 0：基线核验** | 核验金源模板、Demo 与设计资产 | 源码可安装、生产 build 通过；缺失素材、测试与 CI 已登记 | 已完成（遗留项已登记） |
| **Phase 1：配置与版本** | SiteConfig v1、版本化服务端校验、revision、固定模板 | 配置校验通过；同输入生成一致页面 | 已完成（遗留项已登记） |
| **Phase 2：素材与预览** | 内部后台、受控上传适配器、异步构建、预览发布契约 | AC-01～AC-08、AC-11 以本地/Mock 工程验收通过；真实云门槛独立跟踪 | 已完成（真实云未启用） |
| **Phase 3：可靠性** | 日志、幂等重试、健康检查、artifact 回滚与隔离测试 | AC-09、AC-10、AC-12 及故障演练通过 | 待做 |
| **Phase 4：正式发布** | 生产环境、域名、DNS、ICP备案状态 | 另行评审后进入，不属于 V1 | 后续 |
| **Phase 5：Agent 产品化** | 对话采集 → 配置草稿 → 人工确认 | 另行验证需求和成本，不属于 V1 | 后续 |

Phase 0 已确认 `docs/jinyuan/` 下有金源 PRD、设计规范、首页文案和规划摘要；`jinyuan-mvp` 位于外部路径 `C:\Users\Pan\Desktop\jinyuan-mvp`，已成功执行生产构建。PDF、图片、Canvas 视觉稿和自动化测试仍待补齐，不能仅依据旧文档标记为“已完成”。

---

## 9. 验收标准

Phase 2 软件能力允许使用受控本地/Mock 适配器验收，重点证明配置、Asset、Deployment、artifact、幂等、健康检查和静态独立性。本地验收使用真实模板构建及独立 loopback 静态 HTTP 服务，不验证公网 DNS、证书或 CDN。真实 OSS、公网 TLS、云端 P95 和公网微信真机属于“部署基础设施启用门槛”，未通过前不得对外提供平台预览服务。

| 编号 | 验收项 | 通过条件 |
|------|--------|----------|
| AC-01 | 创建站点 | 已登录运营人员创建站点后获得唯一 siteId、revision 1 和审计记录 |
| AC-02 | 配置校验 | 缺少必填项、格式错误或超过数量限制时保存失败，并准确定位字段 |
| AC-03 | 并发编辑 | 两个客户端基于同一 revision 保存时，仅第一个成功；第二个收到版本冲突 |
| AC-04 | 素材上传 | 受控本地或 OSS 适配器中，非法 MIME、超限文件或跨 siteId 路径被拒绝；合法文件生成 Asset 记录 |
| AC-05 | 配置发布 | 指定 revision 发布后返回 jobId，重复幂等请求不产生重复有效任务 |
| AC-06 | 预览时效 | 本地/Mock 标准配置连续 20 次真实模板构建部署中，P95 ≤ 10 分钟，并由独立静态 HTTP 服务验收产物；云端 P95 在基础设施启用时复验 |
| AC-07 | 健康检查 | 首页、产品、资质、关于、联系和关键资源全部成功后才进入 healthy |
| AC-08 | 微信与移动端 | 模板自动化测试输出可用的移动端页面、`tel:` 拨号与可选 PDF 下载链接；公网 iOS/Android 微信真机兼容性在基础设施启用时复验 |
| AC-09 | 失败保护 | 构建或部署失败时，当前健康预览仍指向上一个成功 artifact |
| AC-10 | 回滚 | 运营人员选择历史 artifact 后可原子切换，并生成新的审计与部署记录 |
| AC-11 | 运行时独立 | 生成站点在后台 API 不可用时仍可浏览、拨号和下载静态资源 |
| AC-12 | 越权防护 | 跨 siteId 读写、上传、部署与回滚请求均被服务端拒绝并记录 |

### 9.1 部署基础设施启用门槛

以下项目不阻塞 Phase 2 软件变更归档，但全部通过前不得把本地/Mock 结果宣传为真实 HTTPS 预览交付：

| 编号 | 门槛 | 证据 |
|------|------|------|
| IA-01 | 受控 OSS | bucket、RAM 最小权限、CORS、加密、生命周期和真实直传记录 |
| IA-02 | 公网预览 | preview 泛域名 DNS、有效 TLS 证书、CDN 路由与所在地合规记录 |
| IA-03 | 云端性能与独立性 | 连续 20 次云端部署 P95 ≤ 10 分钟；停止 API 后公网静态站仍可访问 |
| IA-04 | 微信真机 | iOS 16+、Android 12+ 当期稳定版微信打开、拨号和已授权 PDF 下载记录 |

---

## 10. 风险与依赖

| 风险 | 影响 | 缓解 |
|------|------|------|
| 现有模板与 Demo 不在当前仓库 | 无法复用或进度误判 | Phase 0 先核验源码、构建与资产，不以文档勾选代替验收 |
| 素材不齐 | 交付拖延 | 占位图 + 待办清单 |
| 模板外定制持续增加 | 无法规模化、工时失控 | V1 仅 1 套模板；超出配置契约的需求不进入首版 |
| 构建任务执行不可信内容 | 供应链或命令执行风险 | 配置仅允许数据字段；禁止脚本/HTML；构建运行于隔离环境 |
| 异步部署重复或中断 | 重复计费、版本错乱 | 幂等键、不可变 artifact、任务租约、原子切换 |
| OSS/CDN 或 CI 不稳定 | 预览延迟 | 分类重试、超时、可观测日志与保留上一健康版本 |
| 平台预览域名或备案未就绪 | 无法提供统一预览 URL | 提前注册平台域名、配置泛域名证书；如使用中国大陆 OSS/CDN，完成平台域名 ICP 备案 |
| 国内正式域名合规周期长 | 正式上线延期 | V1 只交付平台预览域名；正式发布单独立项 |

### 10.1 商业与交付假设

- V1 由内部运营人员使用，客户购买的是标准化建站交付服务，而非自助软件席位。
- 交付报价应覆盖模板使用、一次内容录入、约定次数微调、托管与后续维护。
- 超出 SiteConfig 配置契约的页面结构和功能属于定制项目，不进入标准交付承诺。
- Phase 2 结束后统计单站人工工时、部署成本、修改轮次和首版确认率，再决定是否开发客户自助后台与 Agent。

---

## 11. 附录

### 11.1 相关文档

- [展站项目计划](./展站计划.md)
- [SiteConfig v1 JSON Schema](./schemas/site-config-v1.schema.json)
- [Demo 迁移到 V1](./migration-demo-to-v1.md)
- [金源电器官网 PRD](./jinyuan/金源电器官网-产品需求文档(PRD).md)
- [金源电器设计规范](./jinyuan/金源电器官网-设计规范.md)
- [金源首页文案](./jinyuan/金源电器官网-首页文案.md)
- [金源官网规划摘要](./jinyuan/金源官网规划-对话摘要.md)
- `jinyuan-mvp` README 与源码（外部路径已核验；建议后续迁入展站 monorepo）

### 11.2 术语表

| 术语 | 定义 |
|------|------|
| **预览交付** | 临时 HTTPS 链接，用于演示与确认 |
| **Revision** | 一次不可变的站点配置快照 |
| **Artifact** | 由特定模板版本和 revision 构建出的不可变静态包 |
| **Deployment** | 将一个 artifact 发布到指定环境的一次可追踪任务 |
| **回滚** | 将环境入口原子切换到历史健康 artifact，并保留新记录 |
| **站点模板** | 可复用的前端工程，由 config 驱动内容 |

---

*文档结束*
