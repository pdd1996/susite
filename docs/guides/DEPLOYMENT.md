# Phase 2 预览部署指南

## 当前状态

代码已实现 OSS PUT 签名、服务端完成复核、不可变 Asset/Artifact 路径、异步 Deployment 状态、模板构建和 HTTPS 健康检查。本地/测试模式的构建运行器仍由 API 进程内任务驱动，尚未接入可跨进程恢复的独立队列 Worker。仓库中也没有真实云凭据、平台域名、DNS、证书或备案证明，因此截至 2026-07-15 只能确认本地适配器和自动化测试，不能声称真实 HTTPS 预览已经交付。

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

Deployment 创建后立即返回 `jobId`。当前本地/测试运行器在 API 进程内执行以下任务：

1. 再次校验 Revision 引用的全部 Asset；
2. 以配置、Asset SHA-256 和模板版本计算输入 checksum；
3. 调用固定模板生产构建，并写入不可变 artifact 前缀；
4. 将 artifact 文件发布到站点预览前缀；
5. 检查 HTTPS 首页、产品、资质、关于和联系路由，以及构建入口引用的 JS/CSS 和 Revision 引用的素材 URL；
6. 全部成功后标记 `healthy`。

相同站点与幂等键只创建一个有效 Deployment。自动重试、原子切换和回滚属于 Phase 3。
真实云预览启用前还必须把运行器接入独立队列 Worker；不得依赖函数请求结束后的进程内微任务。

## 尚未完成的人工验收

- 受控 OSS 测试 bucket 的真实直传；
- 连续 20 次标准部署及 P95 统计；
- iOS 16+、Android 12+ 当期稳定版微信真机打开、拨号和 PDF 下载；
- API 停止后线上静态预览仍可访问；
- 金源真实素材或逐项批准的占位素材。
