# IP 基线部署 Plan

1. 增加 API 与管理后台容器镜像；
2. 增加 MySQL、migration、API、Nginx 的 Compose 编排；
3. 使用 Nginx 同源 `/api` 代理并统一启用 Basic Auth；
4. 增加 Ubuntu Docker 初始化、环境和凭据生成、部署脚本；
5. 更新部署入口及长期部署指南；
6. 执行 Compose 静态检查、仓库测试与构建；
7. 回写任务证据并归档变更包。

## 安全约束

- 不提交 `.env`、数据库密码或 `.htpasswd`；
- API 不直接映射公网端口；
- 不以 `NODE_ENV=production` 绕过当前 IDaaS 启动保护；
- Basic Auth 仅是无域名阶段的临时访问边界，不能替代可信身份认证和 HTTPS。

## 回退

执行 `docker compose --env-file deploy/.env -f deploy/compose.ip-baseline.yml down` 停止服务；默认保留 MySQL volume。只有显式附加 `--volumes` 才删除数据。
