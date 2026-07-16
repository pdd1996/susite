# 展站开发指南（Phase 2）

## 前置条件

- Node.js 20.19+（当前 Vite 版本的最低要求）
- pnpm 10+
- MySQL 8+（仅持久化 API 模式需要）

## 安装与验证

```bash
pnpm install
pnpm check
pnpm build
```

## 本地运行

```bash
# 终端 1：先设置可信的本地操作者；未配置 DATABASE_URL 时使用内存存储
# PowerShell: $env:DEV_ACTOR_ID="local-operator"
pnpm dev:api

# 终端 2：运营后台
pnpm dev:admin
```

访问 `http://localhost:5173`。创建站点时初始 SiteConfig 会与站点、revision 1 和审计记录在同一事务中保存。后台默认请求 `http://localhost:8787`；可通过 `VITE_API_BASE_URL` 覆盖。

未配置 OSS 时，API 使用进程内对象存储并提供 `/local-uploads` 本地上传适配器，可验证签名、文件特征、SHA-256、Asset 归属和后台交互；该模式不生成或伪造 HTTPS 预览 URL。

## MySQL 持久化模式

1. 复制 `apps/api/.env.example` 的变量到本地环境；
2. 建库后按顺序执行 `apps/api/drizzle/0000_phase1_baseline.sql`、`0001_add_site_foreign_keys.sql` 和 `0002_phase2_assets_and_preview.sql`；
3. 设置 `DATABASE_URL` 后启动 API。

`DATABASE_URL` 未设置时只用于本地演示，进程退出后全部数据会丢失。

当前仍不接受客户端传入的操作者身份，`DEV_ACTOR_ID` 仅由服务端环境提供；在接入 IDaaS 前禁止以 `NODE_ENV=production` 启动。

## MySQL 集成测试

```powershell
$env:DATABASE_URL_TEST="mysql://zhansite:password@localhost:3306/zhansite_test"
pnpm --filter @zhansite/api test
```

测试库名称必须包含 `test`，且会被测试清空。未设置 `DATABASE_URL_TEST` 时 MySQL 集成测试显示为 skipped，内存仓库、API 和后台交互测试仍会执行。

## OSS 与 HTTPS 预览

真实预览所需变量见 `apps/api/.env.example`。OSS 配置必须完整，且启用 OSS 时 `UPLOAD_TOKEN_SECRET` 必须至少 32 个字符；部分配置或弱密钥会阻止 API 启动。只有 OSS 凭据、公开 Asset URL、`PLATFORM_DOMAIN`、泛域名 DNS、有效 HTTPS 证书及 CDN 路由全部就绪时，服务端才启用真实预览发布器；否则部署任务进入 `failed` 并记录 `preview_not_configured`。

对象上传使用服务端生成的短时 PUT 签名。完成登记时服务端读取对象内容，校验实际 MIME/文件特征、大小并自行计算 SHA-256；PDF 还必须可解析且至少包含一页。通过后文件复制到不可变 Asset 路径；同一上传令牌重复完成时返回同一 Asset。

## 使用指定 Revision 构建模板

```powershell
$env:SITE_REVISION_PATH="C:\path\to\revision.json"
$env:SITE_ASSET_MAP_PATH="C:\path\to\asset-map.json"
pnpm --filter @zhansite/b2b-manufacturing-v1 build
```

Revision JSON 必须包含 `siteId`、`revision` 和有效的 `config`。Asset map 是 `assetId → HTTPS URL` 的 JSON 对象；未提供时模板隐藏尚未解析的素材。默认 Revision 使用 `templates/b2b-manufacturing-v1/fixtures/jinyuan.revision.json`。

## 工作区

| 路径 | 职责 |
| --- | --- |
| `packages/site-config` | Zod 配置契约和 TypeScript 类型 |
| `apps/api` | Hono API、Drizzle 数据模型与 migration |
| `apps/admin` | 内部运营后台 |
| `templates/b2b-manufacturing-v1` | 固定 B2B 制造站模板 |

契约变更前请先阅读 [ADR-0001](../adr/ADR-0001-doc-authority.md) 与 [Demo 迁移说明](../migration-demo-to-v1.md)。
