# @fivo/dom

框架无关查看器外壳和样式管理。

工具栏通过能力声明决定交互，不通过动作 ID 推断业务。选择项默认是单选值，`options[].kind: 'action'` 可声明重新识别等独立命令，`dividerBefore` 控制分隔线；`allowReselect` 允许再次执行当前显示值。`menu.kind` 可让主栏开关在更多菜单中呈现为命令，`menu.closeOnRun` 可覆盖菜单执行后的默认关闭行为。

视图加载与挂载在打开新文件、取消会话或销毁时停止等待。第三方挂载无法中止时，迟到句柄仍会被释放，不会覆盖新文档的能力和内容。

当前为工作区预发布实现，尚未发布 npm。普通用法自动加载样式；PDF、文本和编辑保存不在当前包中。

请参阅仓库 [框架接入指南](../../apps/docs/docs/guides/preview-integration.md) 和 [兼容范围](../../apps/docs/docs/guides/compatibility.md)。

原文视图通过 @fivo/dom/text 按需加载；文案与高亮装饰分别从 text-messages、text-highlight 子入口消费，分栏拖柄由 @fivo/dom/split 提供。原文视图使用 DOM 样式组。

公共 OutlineTree 支持可选 `renderLabel(node, document)`，返回只用于可见行标签的 DOM 节点；未提供或返回空值时沿用纯文本。`getText` 继续提供可访问名称、展开提示和标签 title。结构阅读颜色可复用外壳的 `--fivo-structure-name/string/literal/muted` 变量，明暗主题使用同一语义。

公共原文视图开启行号时，默认只显示真实逻辑行的数字，底色和分隔线仍覆盖整个阅读区。空白区延续数字的实现保留，由包内 `text/internalFlags.ts` 中的 `extendLineNumbersToViewport` 控制，默认 `false`，不经公共入口、插件配置或工具栏暴露；后续在源码中改为 `true` 即可启用。延续数字属于独立装饰层，不增加原文件行数、不参与选择复制和查找，也不增加滚动范围；折行按真实内容高度计算起点。栏宽按可见行号位数和缩放统一计算，关闭行号同时隐藏整栏装饰，查找、复制和源位置仍使用原始文本。
