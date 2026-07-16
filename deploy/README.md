# Phase 2 预览部署运行入口

## 本地验证

```powershell
$env:DEV_ACTOR_ID="local-operator"
pnpm acceptance:local

# 交互运行
$env:DEV_ACTOR_ID="local-operator"
pnpm dev:api
pnpm dev:admin
```

`pnpm acceptance:local` 使用真实模板构建和独立 loopback 静态 HTTP 服务执行 20 次部署，输出 P95、实际构建次数、静态路由、关键资源与占位 Asset 校验和证据；本地 HTTP URL 不可作为公网预览链接。交互运行未配置 OSS 时使用进程内对象存储，只验证本地上传和 Asset 流程，重启后数据丢失，真实部署任务不会返回 HTTPS URL。

## MySQL

创建符合 `docs/guides/DATABASE.md` 契约的 MySQL 8.0.16+ 数据库，设置 `DATABASE_URL` 后执行：

```powershell
pnpm --filter @zhansite/api db:migrate
```

统一迁移器会执行全部 migration 并登记 checksum。集成测试必须使用库名以 `_test` 结尾的独立 `DATABASE_URL_TEST`。

## 真实预览

配置 `apps/api/.env.example` 中的 `UPLOAD_TOKEN_SECRET`、全部 `OSS_*` 变量和 `PLATFORM_DOMAIN`。API 设置 `RUN_EMBEDDED_DEPLOYMENT_WORKER=false`，并以独立进程启动 Worker：

```powershell
pnpm start:worker
```

API 与 Worker 必须使用同一个 `DATABASE_URL`、OSS 和平台域名配置。执行前先按 `docs/guides/DEPLOYMENT.md` 完成 bucket 权限、CORS、CDN 子域映射、泛域名 DNS、HTTPS 证书和地域合规检查。

仓库不保存 AccessKey。当前没有已验证的云环境参数；真实云启用不阻塞 Phase 2 软件变更归档，但禁止把示例值用于真实部署或把本地/Mock 任务标记为线上验收通过。
