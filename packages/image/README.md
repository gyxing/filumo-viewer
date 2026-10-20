# @fivo/image

只读图片插件及公共图片交互。根入口只注册描述符；@fivo/image/view 提供 mountImageSurface 和 mountImageOverlay，供独立图片和 Office 共用，不依赖 Office 或框架。

支持浏览器原生图片、适应容器、原始尺寸、缩放、旋转、复位和拖动。图片资源通过 resolve 返回本次租约，退出后只归还自身租约；原文件下载单独适配。

当前为未发布工作区实现。新增能力尚需完成统一构建、消费与浏览器验证，详见 [图片与 PDF 指南](../../apps/docs/docs/guides/image-pdf.md)。
