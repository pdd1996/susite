# IP 基线部署 Tasks

- [x] 定义部署边界、验收标准和回退方式
- [x] 添加容器镜像与 Compose 编排
- [x] 添加 Nginx Basic Auth 和同源 API 代理
- [x] 添加 Ubuntu 初始化、环境生成和部署脚本
- [x] 更新 `deploy/README.md`
- [x] 回写 `docs/guides/DEPLOYMENT.md`
- [x] 在安装 Docker 的 Ubuntu 24.04 环境执行 `docker compose config`
- [x] 运行仓库测试、构建、YAML 解析与 `git diff --check`
- [x] 禁用无持久化对象存储时的素材上传，并覆盖 API 与后台提示
- [x] 将宿主机 `600` 的 Basic Auth 文件安全复制为 Nginx 可读的容器内 `640` 文件
- [ ] 在目标服务器完成首次启动、401 边界、数据库迁移和重启持久化验证
- [ ] 归档变更包

## 当前证据

- 2026-07-17：`pnpm check` 通过，共 34 个测试通过；
- 2026-07-17：`pnpm build` 通过；
- 2026-07-17：Python YAML 解析与 `git diff --check` 通过；
- 2026-07-17：修复 `/api` 反代下本地上传路径不匹配与 API 内存对象存储重启丢失风险；IP 基线改为显式禁用上传。
- 2026-07-17：首次服务器启动发现 Nginx worker 无法读取 bind-mounted `600` 凭据；镜像入口改为启动时复制并设置 `root:nginx 640`。
- 2026-07-17：目标 Ubuntu 24.04 已完成 Compose 解析、镜像构建、migration、MySQL/API 健康检查和 Basic Auth 浏览器访问。
- 本地 Windows 未安装 Docker、Bash 或 WSL；Compose 与脚本改由目标 Ubuntu 服务器执行验证。
