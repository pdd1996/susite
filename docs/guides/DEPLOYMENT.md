# Phase 2 预览部署指南

## 当前状态

代码已实现 OSS PUT 签名、服务端完成复核、不可变 Asset/Artifact 路径、异步 Deployment 状态、模板构建、独立轮询 Worker 和 HTTPS 健康检查。Deployment 与 Artifact 通过数据库租约领取，Worker 重启后可继续领取排队任务和过期租约。Phase 2 已按负责人批准的本地/Mock 口径完成软件验收；仓库中没有真实云凭据、平台域名、DNS、证书或备案证明，因此不能声称真实 HTTPS 预览已经交付。

| 项目 | 状态 | 当前证据 |
| --- | --- | --- |
| 本地/Mock 20 次部署 | 已验证 | `pnpm acceptance:local` 执行 20 次真实模板构建，全部 `healthy`，P95 6134.66 ms |
| 本地静态独立性 | 已验证 | 未启动 API 网络监听器时，独立 loopback HTTP 服务可读取首页、产品、资质、关于、联系、构建 JS 与示例 Logo |
| 受控 OSS 与真实直传 | 阻塞/待确认 | 未配置 bucket、RAM、CORS、加密和生命周期 |
| preview DNS 与 CDN | 阻塞/待确认 | 未配置 `*.preview.{PLATFORM_DOMAIN}` 和站点前缀映射 |
| 公网 TLS 证书 | 阻塞/待确认 | 无有效泛域名证书证据 |
| ICP/地域合规 | 阻塞/待确认 | 未确定公开服务地域和备案状态 |
| 云端 20 次部署 P95 | 阻塞/待确认 | 本地 P95 不替代云端数据 |
| 公网微信真机 | 阻塞/待确认 | 模板测试已覆盖拨号/PDF 链接，尚无公网真机记录 |

## OSS

使用独立测试 bucket，并通过 RAM 账号授予最小权限：

- 允许向 `uploads/{siteId}/` 写入短时签名对象；
- 服务端可读取上传对象、复制到 `assets/{siteId}/`，并写入 `artifacts/{siteId}/` 与 `previews/{siteId}/`；
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
4. 将 artifact 文件发布到站点预览前缀；
5. 检查 HTTPS 首页、产品、资质、关于和联系路由，以及构建入口引用的 JS/CSS 和 Revision 引用的素材 URL；
6. 全部成功后标记 `healthy`。

相同站点与幂等键只创建一个有效 Deployment。自动重试、原子切换和回滚属于 Phase 3。

独立 Worker 必须配置 `DATABASE_URL`、全部 `OSS_*` 变量和 `PLATFORM_DOMAIN`；缺少任一项会拒绝启动。`DEPLOYMENT_WORKER_POLL_MS` 可设置为 100～60000 毫秒，默认 1000。可用进程管理器分别托管 API 与 Worker；停止 Worker 后，已部署的纯静态文件不受影响，排队任务会在 Worker 恢复后继续领取。

## 部署基础设施启用前仍需完成

- 受控 OSS 测试 bucket 的真实直传；
- 连续 20 次标准部署及 P95 统计；
- iOS 16+、Android 12+ 当期稳定版微信真机打开、拨号和 PDF 下载；
- API 停止后线上静态预览仍可访问；
- 金源真实素材；内部预览替代方案已经批准，但不等于客户正式素材。
