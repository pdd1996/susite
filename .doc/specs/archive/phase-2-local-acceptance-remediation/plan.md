# Phase 2 本地验收可信度修复实施计划

## 方案摘要

将手写 `LocalMockPublisher` 替换为本地验收发布器：每轮生成新 Revision，调用固定模板的实际生产构建，将生成的 `dist` 复制到临时静态根目录，再由仅绑定 `127.0.0.1` 的 Node HTTP 服务读取。每轮通过 HTTP 验证页面路由、构建 JS 与示例 Logo；API 仅作为进程内 Hono handler 参与创建部署，不启动 API 网络监听器。

示例 Logo 作为受控、无客户商标的 SVG fixture 进入仓库。验收脚本读取文件并计算 SHA-256、大小与本地 HTTP URL，不再伪造这些元数据。

## 数据与契约变化

不修改 SiteConfig、数据库、API 或生产部署契约。验收报告新增本地 HTTP 基址、构建次数、实际 Asset 元数据与逐轮耗时。

## API 与界面变化

无对外 API 和后台界面变化。

## 风险与回滚

- 20 次真实 Vite 构建会延长本地验收时间；使用临时目录并在 finally 中清理。
- 本地 HTTP 不能验证 TLS；报告明确标记为 `local_http_mock`。
- 静态服务器只监听 loopback 且使用临时端口，不暴露到局域网。

## 必须同步的长期文档

- [x] `README.md`
- [x] `docs/展站-产品需求文档(PRD).md`
- [x] `docs/展站计划.md`
- [x] `docs/guides/DEV_GUIDE.md`
- [x] `docs/guides/DEPLOYMENT.md`
- [x] `docs/jinyuan/assets-manifest.md`
- [x] `.doc/specs/archive/phase-2-assets-and-preview/`

## 实施顺序

1. 增加版本控制的中性 SVG fixture；
2. 重写本地验收发布器和 HTTP 验证；
3. 更新文档口径；
4. 运行验收、检查和构建；
5. 归档修复 Spec。
