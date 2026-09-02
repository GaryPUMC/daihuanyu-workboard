# 代寰宇的工作板 1.1.23

本目录对应 1.1.23 本地上传准备版本。`source.tar.gz` 仅包含小程序源码、测试与公开发布配置，不包含患者资料、本地存储、加密备份或私有项目配置。

## 发布重点

- 全局压缩首页、患者详情、查房、患者库、设置、模板、流程设置及导入页中不合时宜的按钮、流程、卡片和留白。
- 患者详情的流程圆点由 72rpx 缩至 40rpx，流程行由 96rpx 缩至 54rpx；复制操作按钮缩至 56rpx。
- 修复“新入院”状态高亮覆盖国疗患者类型色的问题。

## 验证

- `node --test tests/*.test.mjs`：通过（6/6）。
- `node scripts/release-check.mjs`：通过。
- 上传包排除 `releases/`、`project.private.config.json`、`.DS_Store`、本地存储及备份文件。
- SHA-256：`49fc49eea75b70a0c1aabd189a8ef8cd19becbf83597f89fba8265ce27369c06`。
