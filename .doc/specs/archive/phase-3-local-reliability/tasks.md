# Phase 3：本地可靠性任务清单

## 0. 变更治理

- [x] 创建 Phase 3 活跃 Spec、实施计划和任务清单
- [x] 明确本阶段仅以本地/Mock 可靠性闭环退出，真实云门槛保持未启用
- [x] 开发期间持续同步验收状态，完成后先回写长期文档再归档

## 1. 状态机与数据契约

- [x] 定义 publish/rollback 状态机、稳定阶段代码和错误分类
- [x] 定义最多 3 次重试、退避时间及注入式 Clock/Scheduler
- [x] 设计 `site_preview_states`、Deployment 可靠性字段和 `deployment_events`
- [x] 更新 Drizzle schema，并编写不可变的追加式 Phase 3 migration
- [x] 更新仓库接口、内存实现和 MySQL 实现
- [x] 为 preview state 激活实现带 `expected_version + lease_token` 的事务条件更新
- [x] 为 Deployment 事件实现追加、幂等顺序和同站归属约束

## 2. 失败保护与原子激活

- [x] 将发布器拆分为候选 release 准备、健康检查和激活步骤
- [x] 使用不可变 `releases/{siteId}/{deploymentId}/{artifactId}` 前缀
- [x] 修改本地预览解析，使公开 URL 始终读取当前 active pointer
- [x] 确保构建失败不改变上一健康版本
- [x] 确保 release 准备失败不改变上一健康版本
- [x] 确保路由或关键资源健康检查失败不改变上一健康版本
- [x] 处理数据库激活成功但 Worker 确认丢失的幂等恢复
- [x] 拒绝过期 Worker、旧 lease token 和 activation version 冲突写入

## 3. 自动重试与日志

- [x] 实现 transient/permanent/concurrency 错误分类
- [x] 实现 `retry_waiting`、`next_attempt_at` 和到期任务领取
- [x] 实现最多 3 次有界重试，永久错误直接失败
- [x] 在领取、构建、准备发布、健康检查、激活、失败和重试调度时追加事件
- [x] 实现统一日志清洗，过滤密钥、签名参数、内部 URL 和堆栈
- [x] 让重启后的 Worker 恢复到期任务，且不重复激活或重复审计成功

## 4. 回滚与 API

- [x] 实现当前 preview state 查询
- [x] 实现同站点 ready artifact 列表
- [x] 实现 Deployment 阶段日志查询
- [x] 实现带幂等键的回滚任务创建
- [x] 回滚前验证 artifact 存在、ready 且属于同一站点
- [x] 回滚复用候选准备、健康检查和原子激活流程
- [x] 为发布成功、失败、重试、回滚请求和回滚成功写审计记录
- [x] 对跨站读取、部署、日志和回滚返回不泄露资源存在性的稳定错误

## 5. 后台交互

- [x] 显示当前健康 artifact、Revision 和激活时间
- [x] 显示 Deployment 类型、attempt、下一重试时间和安全错误码
- [x] 显示按顺序排列的阶段日志
- [x] 显示失败时上一健康版本是否仍在服务
- [x] 提供历史 ready artifact 回滚操作和显式确认
- [x] 增加重试状态、日志、回滚成功/失败和权限拒绝交互测试

## 6. 自动化测试与故障演练

- [x] 增加仓库单元测试：原子激活、版本冲突、事件顺序、到期领取、次数上限
- [x] 增加 Worker 测试：构建、存储、健康检查、激活确认和租约故障注入
- [x] 增加 API 测试：回滚幂等、非法 artifact、跨站隔离和日志清洗
- [x] 增加 MySQL 集成测试：migration、复合外键、并发激活、fencing 和跨站约束
- [x] 增加 AC-09 本地验收：发布 A 后对 B 注入各类失败，A 始终完整可读
- [x] 增加 AC-10 本地验收：成功发布 B 后原子回滚 A，并验证记录完整
- [x] 增加 AC-12 隔离验收：跨站读写、部署、日志与回滚全部拒绝并审计
- [x] 演练 Worker 激活前中断、激活后确认丢失、租约过期和进程重启
- [x] 运行 `pnpm check`
- [x] 运行 `pnpm test`
- [x] 运行 `pnpm build`
- [x] 运行 Phase 3 本地可靠性验收命令
- [x] 运行 `git diff --check`

## 7. 文档回写与归档

- [x] 回写 `README.md`、展站计划和展站 PRD
- [x] 回写 `DATABASE.md`、`DEV_GUIDE.md`、`DEPLOYMENT.md` 和 `deploy/README.md`
- [x] 如实记录本地故障演练结果及仍未执行的真实云门槛
- [x] 在 `spec.md` 填写测试、构建和人工验收结果
- [x] 验收完成后将本目录移入 `.doc/specs/archive/phase-3-local-reliability/`
