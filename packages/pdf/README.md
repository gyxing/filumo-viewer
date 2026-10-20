# @fivo/pdf

基于固定版本 pdfjs-dist 6.4.299 的只读连续阅读插件。普通滚轮连续浏览全文，页面 DOM、Canvas、文字层和缩略图均按窗口管理。

使用 pdf({ assetsBaseUrl: '/fivo-pdf/' })，将 dist/assets/pdfjs 的内容保留结构部署到该目录。直接 ESM 保留包目录时可使用默认地址；打包宿主显式复制资产并配置地址。Worker、字体、CMap、WASM、ICC 和文字层 CSS 必须来自同一发行包，不默认连接 CDN。

仅导入根入口不创建 Worker，也不加载引擎；@fivo/pdf/assets 提供无 DOM 的地址解析。公开配置不暴露 PDF.js 类型。

默认 Canvas 预算 96 MiB、单图 8,388,608 像素、绘制并发 2、DPR 上限 2，文本缓存估算 16 MiB；预算不包含整个引擎或浏览器的所有额外内存。

当前为未发布工作区实现。安装、构建与真实浏览器性能结果须单独确认，详见 [图片与 PDF 指南](../../apps/docs/docs/guides/image-pdf.md)。
