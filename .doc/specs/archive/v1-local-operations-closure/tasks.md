# V1 本地交付闭环任务清单

## 0. 变更治理

- [x] 创建 V1 本地交付闭环 Spec、实施计划和任务清单
- [x] 明确云服务、正式域名、DNS、备案与 Agent 不进入本阶段
- [x] 开发期间持续同步验收状态，完成后先回写长期文档再归档

## 1. 状态与数据契约

- [x] 定义 ContentStatus、ReviewRecord、稳定错误和迁移规则
- [x] 为 SiteRevision 增加 contentStatus
- [x] 更新 Drizzle schema 并增加追加式 migration
- [x] 为 ReviewRecord 增加同站 Revision/Deployment 复合约束
- [x] 更新仓库接口与内存实现
- [x] 实现 MySQL 原子审核事务、条件迁移与查询

## 2. API 与隔离

- [x] 实现审核记录列表和新增接口
- [x] 实现 Revision 归档接口
- [x] 实现站点审计时间线接口
- [x] 验证预览发送绑定同站、同 Revision 的 healthy Deployment
- [x] 为审核与状态变化写追加式审计
- [x] 对跨站 Revision、Deployment 和 ReviewRecord 访问统一拒绝并审计

## 3. 后台运营流程

- [x] 显示 Revision 内容状态
- [x] 实现记录预览发送、客户反馈和客户确认
- [x] 显示审核时间线
- [x] 实现显式归档与状态冲突提示
- [x] 保证站点切换与异步响应不串站

## 4. 自动化测试与本地验收

- [x] 增加仓库状态机与原子性测试
- [x] 增加 API 审核、归档、审计与跨站隔离测试
- [x] 增加后台审核流程交互测试
- [x] 增加 MySQL migration、约束、持久化、并发与跨站测试
- [x] 增加完整本地流程验收：创建 → 配置 → 发布 → 审核 → 修改 → 再发布 → 确认 → 回滚
- [x] 运行 `pnpm check`
- [x] 运行 `pnpm test`
- [x] 运行 `pnpm build`
- [x] 运行本地交付闭环验收命令
- [x] 运行 `git diff --check`

## 5. 文档回写与归档

- [x] 回写 `README.md`、展站计划和展站 PRD
- [x] 回写 `DATABASE.md`、`DEV_GUIDE.md`、`DEPLOYMENT.md` 和 `deploy/README.md`
- [x] 如实记录 MySQL、本地端到端结果与仍未启用的外部门槛
- [x] 在 `spec.md` 填写验证结果
- [x] 验收完成后将本目录移入 `.doc/specs/archive/v1-local-operations-closure/`
