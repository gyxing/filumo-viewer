# @fivo/viewer

包含 Office、纯文本、JSON、Markdown、图片和 PDF 轻量描述符的标准预设。

当前为工作区预发布实现，尚未发布 npm。引擎、阅读视图、Worker、格式样式按需加载；不包含编辑保存。PDF 的静态资源按 [图片与 PDF 指南](../../apps/docs/docs/guides/image-pdf.md) 部署。只需要单一格式时可独立安装对应格式包。

请参阅仓库 [框架接入指南](../../apps/docs/docs/guides/preview-integration.md) 和 [兼容范围](../../apps/docs/docs/guides/compatibility.md)。

标准预设注册 Office、Text、JSON（含 JSONC/JSONL/NDJSON）、Markdown、Image、PDF、CSV/TSV、XML、Code 九个插件。注册保持轻量，打开对应格式才加载实现。安装预设会安装所有格式依赖，仅需部分格式时使用独立插件包。
