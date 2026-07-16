# 展站开发指南（Phase 2）

## 前置条件

- Node.js 20.19+（当前 Vite 版本的最低要求）
- pnpm 10+
- Oracle MySQL 8.0.16+（仅持久化 API 模式需要；数据库使用 `utf8mb4_0900_ai_ci`）

## 安装与验证

```bash
pnpm install
pnpm acceptance:local
pnpm check
pnpm build
```

`pnpm acceptance:local` 使用受控内存仓库、真实模板生产构建和仅绑定 loopback 的独立静态 HTTP 服务连续执行 20 次部署。它断言每轮实际构建、全部任务为 `healthy`、P95 不超过 10 分钟、占位 Asset 的真实校验和、5 个静态路由及关键 JS/Logo 可通过 HTTP 读取；验收过程不启动 API 网络监听器。报告中的本地 HTTP URL 仅验证静态产物，不代表公网 TLS 已配置。

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

1. 按 [数据库设计与运维](DATABASE.md#本机从零建库) 创建 `zhansite` 与 `zhansite_test`；
2. 将 `apps/api/.env.example` 复制为 Git 忽略的 `apps/api/.env`，填写 `DATABASE_URL`、`DATABASE_URL_TEST` 和 `DEV_ACTOR_ID`；
3. 执行 `pnpm --filter @zhansite/api db:migrate`；
4. 运行 API 测试后执行 `pnpm dev:api`。

API、Worker 和迁移命令会自动读取 `apps/api/.env`，已有进程环境变量优先。密码包含 URL 保留字符时必须先 URL 编码。不要手工逐条执行 SQL；统一迁移器会记录 migration 文件名与 checksum，并拒绝已执行文件被改写。

`DATABASE_URL` 未设置时只用于本地演示，进程退出后全部数据会丢失。

当前仍不接受客户端传入的操作者身份，`DEV_ACTOR_ID` 仅由服务端环境提供；在接入 IDaaS 前禁止以 `NODE_ENV=production` 启动。

## MySQL 集成测试

```powershell
$env:DATABASE_URL_TEST="mysql://zhansite:password@localhost:3306/zhansite_test"
pnpm --filter @zhansite/api test
```

测试库名称必须以 `_test` 结尾，且会被测试清空。未设置 `DATABASE_URL_TEST` 时 MySQL 集成测试显示为 skipped，内存仓库、API 和后台交互测试仍会执行。

## OSS 与 HTTPS 预览

真实预览所需变量见 `apps/api/.env.example`。OSS 配置必须完整，且启用 OSS 时 `UPLOAD_TOKEN_SECRET` 必须至少 32 个字符；部分配置或弱密钥会阻止 API 启动。只有 OSS 凭据、公开 Asset URL、`PLATFORM_DOMAIN`、泛域名 DNS、有效 HTTPS 证书及 CDN 路由全部就绪时，服务端才启用真实预览发布器；否则部署任务进入 `failed` 并记录 `preview_not_configured`。

Phase 2 软件能力以 `pnpm acceptance:local` 退出；真实 OSS、公网 DNS/TLS/CDN、云端 P95 和公网微信真机属于部署基础设施启用门槛。未通过这些门槛时可以开发和回归，但不得把 Mock URL 用作客户预览链接。

对象上传使用服务端生成的短时 PUT 签名。完成登记时服务端读取对象内容，校验实际 MIME/文件特征、大小并自行计算 SHA-256；PDF 还必须可解析且至少包含一页。通过后文件复制到不可变 Asset 路径；同一上传令牌重复完成时返回同一 Asset。

受控预览环境应设置 `RUN_EMBEDDED_DEPLOYMENT_WORKER=false`，并在独立终端运行 `pnpm start:worker`。API 与 Worker 必须连接同一个 MySQL、OSS 和平台域名配置；本地开发可保留默认的内嵌 Worker。

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
