# IP 基线部署 Spec

## 背景

在火山引擎 Ubuntu 24.04 单机 `118.196.82.13` 上部署展站 V1 的受控基线。当前暂不提供域名、HTTPS、OSS、CDN 和可信 IDaaS，因此本变更不能宣称完成真实预览或生产发布。

## 范围

- 以 Docker Compose 运行 MySQL、数据库迁移、API 和管理后台；
- 仅向公网暴露 80 端口，MySQL 与 API 保持在容器网络内；
- 通过 Nginx Basic Auth 为临时公网访问增加统一边界；
- 未配置持久化对象存储时禁用素材上传，避免重启后产生失效素材记录；
- 提供 Ubuntu 初始化、环境生成和部署脚本；
- 固化公网 IP 为当前示例值，但允许通过环境文件覆盖。

## 非范围

- 域名、HTTPS、证书、ICP备案；
- OSS、CDN、真实素材直传及公网静态预览；
- 独立发布 Worker、生产发布与 IDaaS；
- 修改 SiteConfig、数据库 Schema、API 契约或模板。

## 验收标准

1. `docker compose config` 可在示例环境下完成解析；
2. 管理后台构建时使用同源 `/api`，Nginx 将其转发到内部 API；
3. 公网只映射 Nginx 的 80 端口，数据库和 API 无宿主机端口；
4. API 在 MySQL migration 成功后启动，发布 Worker 默认关闭；
5. Nginx 对后台和 API 统一启用 Basic Auth；
6. `pnpm check` 与 `pnpm build` 通过；
7. 文档明确该环境是受控演示基线，不是生产或真实预览交付。
8. API 拒绝素材上传签发，管理后台不显示上传控件。

## 长期文档回写

- `docs/guides/DEPLOYMENT.md`
- `deploy/README.md`
