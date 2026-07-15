# Phase 1 开发指南

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

访问 `http://localhost:5173`，先创建金源站点，再保存一个 Revision。后台默认请求 `http://localhost:8787`；可通过 `VITE_API_BASE_URL` 覆盖。

## MySQL 持久化模式

1. 复制 `apps/api/.env.example` 的变量到本地环境；
2. 建库后按顺序执行 `apps/api/drizzle/0000_phase1_baseline.sql` 和 `0001_add_site_foreign_keys.sql`；
3. 设置 `DATABASE_URL` 后启动 API。

`DATABASE_URL` 未设置时只用于本地演示，进程退出后全部数据会丢失。

Phase 1 不接受客户端传入的操作者身份，`DEV_ACTOR_ID` 仅由服务端环境提供；在接入 IDaaS 前禁止以 `NODE_ENV=production` 启动。

## 使用指定 Revision 构建模板

```powershell
$env:SITE_REVISION_PATH="C:\path\to\revision.json"
pnpm --filter @zhansite/b2b-manufacturing-v1 build
```

Revision JSON 必须包含 `siteId`、`revision` 和有效的 `config`。默认使用 `templates/b2b-manufacturing-v1/fixtures/jinyuan.revision.json`，测试会按 SiteConfig v1 校验该 fixture。

## 工作区

| 路径 | 职责 |
| --- | --- |
| `packages/site-config` | Zod 配置契约和 TypeScript 类型 |
| `apps/api` | Hono API、Drizzle 数据模型与 migration |
| `apps/admin` | 内部运营后台 |
| `templates/b2b-manufacturing-v1` | 固定 B2B 制造站模板 |

契约变更前请先阅读 [ADR-0001](../adr/ADR-0001-doc-authority.md) 与 [Demo 迁移说明](../migration-demo-to-v1.md)。
