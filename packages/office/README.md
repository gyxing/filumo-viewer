# @fivo/office

原生 Office 预览，按格式懒加载，不依赖 React/Vue。

当前为工作区预发布实现，尚未发布 npm。普通用法自动加载样式；PDF、文本和编辑保存不在当前包中。

请参阅仓库 [框架接入指南](../../apps/docs/docs/guides/preview-integration.md) 和 [兼容范围](../../apps/docs/docs/guides/compatibility.md)。

Office 图片弹层按操作加载 `@fivo/image/view`，继续使用 Office 的原图资源与下载。自动样式继承宿主的 nonce；使用 external 样式模式时还需加载 `@fivo/image/styles.css`，版本须与当前依赖匹配。
