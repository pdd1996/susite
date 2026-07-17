# V1 运行与 IP 基线部署入口

## 火山引擎 IP 基线

`deploy/compose.ip-baseline.yml` 面向 Ubuntu 24.04 单机、无域名阶段的受控演示，当前默认地址为 `http://118.196.82.13`。它运行：

- MySQL 8.4 和追加式数据库迁移；
- 仅容器网络可访问的 API；
- 构建后的管理后台；
- 统一启用 Basic Auth 的 Nginx 网关。

该基线不运行发布 Worker，不提供 OSS、真实素材直传、公网静态预览、HTTPS 或可信 IDaaS。管理后台的素材上传会被显式禁用，避免把文件写入 API 的易失内存而在重启后丢失；管理后台中的发布任务也不是本次验收范围。这不是生产环境，也不能作为真实预览已交付的证据。

### 服务器前置条件

1. 在火山引擎安全组只开放 TCP 22 和 80，不开放 3306、8787；
2. 将仓库同步到服务器；
3. 安装 Docker：

```bash
sudo bash deploy/scripts/bootstrap-ubuntu.sh
```

重新登录使 docker 用户组生效，然后在仓库根目录生成随机数据库凭据和 Basic Auth 文件：

```bash
bash deploy/scripts/prepare-env.sh
```

凭据保存在被 Git 忽略的 `deploy/.env` 与 `deploy/secrets/.htpasswd`。不要提交、发送或复制到命令历史。部署：

```bash
bash deploy/scripts/deploy.sh
```

浏览器访问 `http://118.196.82.13` 并输入刚设置的临时用户名和密码。Basic Auth 通过明文 HTTP 传输，只适用于临时、低敏感、受控演示；不得录入真实客户敏感素材。绑定域名并启用 HTTPS/IDaaS 后应移除该临时边界。

### 常用运维

```bash
docker compose --env-file deploy/.env -f deploy/compose.ip-baseline.yml ps
docker compose --env-file deploy/.env -f deploy/compose.ip-baseline.yml logs --tail=200
docker compose --env-file deploy/.env -f deploy/compose.ip-baseline.yml down
```

`down` 默认保留 `mysql-data`。不要使用 `down --volumes`，除非已确认要永久删除数据库。升级前应按 `docs/guides/DATABASE.md` 备份 MySQL；再次执行 `deploy.sh` 会构建镜像并在 API 启动前运行幂等 migration。

## 本地验证

```powershell
$env:DEV_ACTOR_ID="local-operator"
pnpm acceptance:local
pnpm acceptance:reliability
pnpm acceptance:operations

# 交互运行
$env:DEV_ACTOR_ID="local-operator"
pnpm dev:api
pnpm dev:admin
```

`pnpm acceptance:local` 保留真实模板构建和独立 loopback 静态 HTTP 证据；`pnpm acceptance:reliability` 验证 AC-09/10/12、重试、事件、回滚和 MySQL 原子激活；`pnpm acceptance:operations` 验证 AC-13 的创建、发布、审核、反馈、修改、确认、回滚以及 ReviewRecord/MySQL 隔离。交互运行未配置 OSS 时使用进程内适配器，重启后数据丢失，本地 URL 不可作为公网预览链接。

## MySQL

创建符合 `docs/guides/DATABASE.md` 契约的 MySQL 8.0.16+ 数据库，设置 `DATABASE_URL` 后执行：

```powershell
pnpm --filter @zhansite/api db:migrate
```

统一迁移器会执行全部 migration 并登记 checksum。集成测试必须使用库名以 `_test` 结尾的独立 `DATABASE_URL_TEST`。

Phase 3 对应 `0005_phase3_local_reliability.sql`，V1 本地交付闭环对应 `0006_v1_local_operations_closure.sql`，后者增加 Revision 内容状态、ReviewRecord 和同站 Revision/Deployment 复合归属约束。升级后必须先完成 `pnpm acceptance:reliability` 与 `pnpm acceptance:operations`，再启动 Worker。

## 真实预览

配置 `apps/api/.env.example` 中的 `UPLOAD_TOKEN_SECRET`、全部 `OSS_*` 变量和 `PLATFORM_DOMAIN`。API 设置 `RUN_EMBEDDED_DEPLOYMENT_WORKER=false`，并以独立进程启动 Worker：

```powershell
pnpm start:worker
```

API 与 Worker 必须使用同一个 `DATABASE_URL`、OSS 和平台域名配置。执行前先按 `docs/guides/DEPLOYMENT.md` 完成 bucket 权限、CORS、CDN 子域映射、泛域名 DNS、HTTPS 证书和地域合规检查。

Worker 只准备不可变 release；数据库 active pointer 是激活事实来源。停止 Worker 不影响当前健康版本；恢复后仅领取到期 `retry_waiting` 或租约过期任务。

仓库不保存 AccessKey。当前没有已验证的云环境参数；真实云启用不阻塞 Phase 3 软件变更归档，但禁止把示例值用于真实部署或把本地/Mock 任务标记为线上验收通过。
