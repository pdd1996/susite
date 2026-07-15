# 展站变更 Spec

`.doc/` 用于管理一次开发变更的短期工作文档；长期有效的产品与工程事实仍维护在 `docs/`。

## 目录

```text
.doc/
├── templates/              # 新变更的起始模板
└── specs/
    ├── active/<feature>/   # 正在开发的变更
    └── archive/<feature>/  # 已验收并回写长期文档的变更
```

## 何时需要创建 Spec

以下任一情况必须建立 `.doc/specs/active/<feature>/`：

- 修改产品范围、验收标准、SiteConfig、数据库或 API；
- 涉及两个及以上工作区；
- 会影响客户站点内容、模板或部署流程。

纯文案、链接、格式修正，以及不改变行为的局部代码维护不强制建立 Spec。

## 开始与结束

1. 从 `templates/` 复制 `spec.md`、`plan.md`、`tasks.md`；
2. 在 `spec.md` 写清目标、非目标和验收标准后再开始实现；
3. 实施期间按 `tasks.md` 更新状态；
4. 验收后回写 `docs/` 中的长期事实；
5. 将整个目录移入 `specs/archive/`，并在 `spec.md` 填写完成日期和验证结果。

详细治理规则见 [ADR-0002](../docs/adr/ADR-0002-spec-driven-document-governance.md)。
