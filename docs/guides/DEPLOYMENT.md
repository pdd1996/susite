# V1 预览部署、本地可靠性与审核状态指南

## 当前状态

代码已实现不可变 Asset/Artifact/release、异步 Deployment、数据库租约、最多 3 次有界重试、阶段事件、原子 preview pointer、同站 artifact 回滚，以及 Revision 内容状态和追加式 ReviewRecord。V1 本地交付闭环已按本地/Mock 与 MySQL 口径完成软件验收；仓库中没有真实云凭据、平台域名、DNS、证书或备案证明，因此不能声称真实 HTTPS 预览已经交付。

| 项目 | 状态 | 当前证据 |
| --- | --- | --- |
| 本地/Mock 20 次部署 | 已验证 | `pnpm acceptance:local` 通过 active pointer 执行 20 次真实模板构建，全部 `healthy`，2026-07-17 复验 P95 3103.24 ms |
| 本地静态独立性 | 已验证 | 未启动 API 网络监听器时，独立 loopback HTTP 服务可读取首页、产品、资质、关于、联系、构建 JS 与示例 Logo |
| 本地发布可靠性 | 已验证 | `pnpm acceptance:reliability` 覆盖 AC-09/10/12、三次重试、日志清洗、回滚、MySQL 原子激活与 fencing |
| 本地审核交付闭环 | 已验证 | `pnpm acceptance:operations` 覆盖创建、发布、发送审核、反馈、修改、确认、回滚、ReviewRecord、审计与 MySQL 跨站约束 |
| 受控 OSS 与真实直传 | 阻塞/待确认 | 未配置 bucket、RAM、CORS、加密和生命周期 |
| preview DNS 与 CDN | 阻塞/待确认 | 未配置 `*.preview.{PLATFORM_DOMAIN}` 和站点前缀映射 |
| 公网 TLS 证书 | 阻塞/待确认 | 无有效泛域名证书证据 |
| ICP/地域合规 | 阻塞/待确认 | 未确定公开服务地域和备案状态 |
| 云端 20 次部署 P95 | 阻塞/待确认 | 本地 P95 不替代云端数据 |
| 公网微信真机 | 阻塞/待确认 | 模板测试已覆盖拨号/PDF 链接，尚无公网真机记录 |

## 无域名 IP 基线

仓库提供 `deploy/compose.ip-baseline.yml`，用于在 Ubuntu 24.04 单机上先运行 MySQL、migration、API 与管理后台。当前示例公网入口是 `http://118.196.82.13`；只有 Nginx 映射宿主机 80 端口，API 与 MySQL 保持在容器网络内，Nginx 对后台和 `/api` 统一启用 Basic Auth。

该环境明确关闭发布 Worker，并且不配置 OSS、平台域名或 release 健康检查入口。Compose 将 `UPLOADS_ENABLED` 与 `VITE_UPLOADS_ENABLED` 设为 `false`：API 拒绝签发上传，管理后台不显示上传控件，避免 MySQL 保存元数据而 API 进程内对象存储在重启后丢失文件。因此它只验证管理与数据库元数据持久化基线，不产生公网静态预览，不能用于 AC-08 公网真机、云端 20 次部署或正式交付验收。当前 API 仍使用受信任的单一 `DEV_ACTOR_ID`，服务端会拒绝 `NODE_ENV=production`；Basic Auth 只是无域名阶段的临时外围保护，不能替代 IDaaS。由于 HTTP 不加密，不得在该环境录入密码、商业机密或真实客户敏感素材。

服务器初始化、凭据生成、部署、停止和数据保留命令以 `deploy/README.md` 为准。火山引擎安全组只开放 TCP 22/80，不开放 MySQL 3306 和 API 8787。启用域名、HTTPS、OSS 或真实预览时必须另行评审，不能在此基线上直接宣称生产化。

## OSS

使用独立测试 bucket，并通过 RAM 账号授予最小权限：

- 允许向 `uploads/{siteId}/` 写入短时签名对象；
- 服务端可读取上传对象、复制到 `assets/{siteId}/`，并写入 `artifacts/{siteId}/` 与不可变 `releases/{siteId}/{deploymentId}/{artifactId}/`；
- 浏览器不得获得长期 AccessKey；
- bucket CORS 只允许后台来源执行签名 PUT 所需的方法和请求头；
- 临时 `uploads/` 设置生命周期清理；已复核 Asset 与 Artifact 不自动覆盖。

服务端变量以 `apps/api/.env.example` 为准。`OSS_PUBLIC_BASE_URL` 必须是模板和终端用户可通过 HTTPS 读取的 Asset 基础地址。

## 域名与 HTTPS

预览格式固定为 `https://{siteId}.preview.{PLATFORM_DOMAIN}`。真实验收前必须人工确认：

1. 平台控制该根域名；
2. `*.preview.{PLATFORM_DOMAIN}` 泛域名 DNS 指向预览 CDN；
3. 泛域名证书有效且覆盖该层级；
4. CDN 按站点子域映射到 `previews/{siteId}/`，并支持产品、资质、关于、联系路由的静态入口；
5. 若使用中国大陆地域公开服务，平台域名已满足 ICP 等合规要求。

缺少任何前置条件时，不得填写虚构 URL；部署任务应以 `preview_not_configured` 或具体健康检查错误失败。

## 构建与发布

Deployment 创建后立即返回 `jobId`。本地开发默认由 API 内嵌轮询器处理；受控预览环境必须设置 `RUN_EMBEDDED_DEPLOYMENT_WORKER=false`，并用 `pnpm start:worker` 启动独立 Worker。API 和 Worker 必须连接同一个 MySQL 数据库并使用相同的 OSS、平台域名配置。Worker 执行以下任务：

1. 再次校验 Revision 引用的全部 Asset；
2. 以配置、Asset SHA-256 和模板版本计算输入 checksum；
3. 调用固定模板生产构建，并写入不可变 artifact 前缀；
4. 将 artifact 准备到不可变 release 前缀；
5. 通过 `PREVIEW_RELEASE_HEALTH_BASE_URL` 检查候选 release 的首页、产品、资质、关于和联系路由，以及关键 JS/CSS 和 Revision 引用素材；
6. 以 `expected preview version + lease token` 在数据库事务中原子激活；
7. 全部成功后标记 `healthy` 并追加事件与审计。

相同站点、操作类型与幂等键只创建一个有效 Deployment。Transient 错误按 1 秒、5 秒、30 秒退避且最多尝试 3 次；permanent 与 concurrency 错误立即停止。回滚创建新的 `kind=rollback` Deployment，验证同站 ready artifact 后复用同一候选检查和原子激活流程，历史 artifact 不修改。

## 内容批准与部署状态

`contentStatus` 与 Deployment 状态正交：`review_requested` 或 `approved` 不会创建、激活或回滚 artifact，`healthy` 也不代表客户已经确认内容。记录预览发送时必须引用同站、同 Revision 的 healthy Deployment；客户反馈和确认继续引用该预览并追加 ReviewRecord。正式生产发布仍属于 Phase 4，不能把 `approved + healthy preview` 表述为客户正式域名已上线。

独立 Worker 必须配置 `DATABASE_URL`、全部 `OSS_*` 变量、`PLATFORM_DOMAIN` 和 `PREVIEW_RELEASE_HEALTH_BASE_URL`；缺少任一项会拒绝启动。候选健康路由与公开 preview 路由必须读取同一 release 映射，公开路由以数据库 active pointer 为事实来源。`DEPLOYMENT_WORKER_POLL_MS` 可设置为 100～60000 毫秒，默认 1000。可用进程管理器分别托管 API 与 Worker；停止 Worker 后，已部署的纯静态文件不受影响，排队任务会在 Worker 恢复后继续领取。

## 部署基础设施启用前仍需完成

- 受控 OSS 测试 bucket 的真实直传；
- 连续 20 次标准部署及 P95 统计；
- iOS 16+、Android 12+ 当期稳定版微信真机打开、拨号和 PDF 下载；
- API 停止后线上静态预览仍可访问；
- 金源真实素材；内部预览替代方案已经批准，但不等于客户正式素材。
