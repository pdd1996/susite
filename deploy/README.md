# Phase 2 预览部署运行入口

## 本地验证

```powershell
$env:DEV_ACTOR_ID="local-operator"
pnpm dev:api
pnpm dev:admin
```

未配置 OSS 时使用进程内对象存储，只验证本地上传和 Asset 流程，重启后数据丢失，部署任务不会返回 HTTPS URL。

## MySQL

按顺序执行：

```text
apps/api/drizzle/0000_phase1_baseline.sql
apps/api/drizzle/0001_add_site_foreign_keys.sql
apps/api/drizzle/0002_phase2_assets_and_preview.sql
apps/api/drizzle/0003_reliable_deployment_leases.sql
```

然后设置 `DATABASE_URL`。集成测试必须使用独立的 `DATABASE_URL_TEST`。

## 真实预览

配置 `apps/api/.env.example` 中的 `UPLOAD_TOKEN_SECRET`、全部 `OSS_*` 变量和 `PLATFORM_DOMAIN`。API 设置 `RUN_EMBEDDED_DEPLOYMENT_WORKER=false`，并以独立进程启动 Worker：

```powershell
pnpm start:worker
```

API 与 Worker 必须使用同一个 `DATABASE_URL`、OSS 和平台域名配置。执行前先按 `docs/guides/DEPLOYMENT.md` 完成 bucket 权限、CORS、CDN 子域映射、泛域名 DNS、HTTPS 证书和地域合规检查。

仓库不保存 AccessKey。当前没有已验证的云环境参数，禁止把示例值用于真实部署或把本地任务标记为线上验收通过。
