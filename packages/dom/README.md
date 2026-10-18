# @fivo/dom

框架无关查看器外壳和样式管理。

工具栏通过能力声明决定交互，不通过动作 ID 推断业务。选择项默认是单选值，`options[].kind: 'action'` 可声明重新识别等独立命令，`dividerBefore` 控制分隔线；`allowReselect` 允许再次执行当前显示值。`menu.kind` 可让主栏开关在更多菜单中呈现为命令，`menu.closeOnRun` 可覆盖菜单执行后的默认关闭行为。

视图加载与挂载在打开新文件、取消会话或销毁时停止等待。第三方挂载无法中止时，迟到句柄仍会被释放，不会覆盖新文档的能力和内容。

当前为工作区预发布实现，尚未发布 npm。普通用法自动加载样式；PDF、文本和编辑保存不在当前包中。

请参阅仓库 [框架接入指南](../../apps/docs/docs/guides/preview-integration.md) 和 [兼容范围](../../apps/docs/docs/guides/compatibility.md)。
