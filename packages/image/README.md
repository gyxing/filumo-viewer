# @filumo/image

Native browser image preview plugin and reusable image surfaces for Filumo, with zoom, rotation, panning and modal previews.

使用浏览器原生图像解码的独立图片预览插件，同时提供 Office 等格式可复用的图片表面与弹层入口。

本文档对应 **0.1.0**。以下命令展示 npm 发布后的消费方式；从当前源码工作区使用时，请先按接入指南构建各包。

## 主要能力

- 识别 PNG、JPEG、GIF、WebP、BMP、SVG、AVIF；实际能否解码取决于浏览器。
- 提供适应窗口、原始比例、缩放、旋转、拖动与复位；保留原始文件用于下载。
- 共享交互从 @filumo/image/view 按需加载，单独注册 image() 不会创建 DOM 或解码图片。

## 安装

```sh
pnpm add @filumo/dom @filumo/image
# 或使用 npm
npm install @filumo/dom @filumo/image
```


## 最小接入

```html
<div id="viewer"></div>
<button id="dispose" type="button">关闭预览</button>
```

```ts
import { createViewer } from '@filumo/dom';
import { image } from '@filumo/image';

const container = document.getElementById('viewer');
if (!container) throw new Error('缺少预览容器');

const viewer = createViewer(container, {
  plugins: [image()],
  height: 640,
  locale: 'zh-CN',
  resourcePolicy: { maxFileBytes: 20 * 1024 * 1024 },
  onError: (error) => console.error(error),
});

try {
  await viewer.open("/files/example.png");
} catch (error) {
  console.error(error);
}

document.getElementById('dispose')?.addEventListener('click', () => {
  void viewer.destroy();
});
window.addEventListener('pagehide', () => {
  void viewer.destroy();
}, { once: true });
```

将示例 URL 换成真实可访问的文件地址，或在文件选择事件中传入 File。20 MiB 等示例限制是宿主配置，不是库默认限制；关闭时由句柄释放会话、资源与样式租约。

## 常用配置

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `maxDecodedPixels` | 未设置额外像素上限 | 可设正整数，在获得自然尺寸后限制宽乘高；不是解码前的内存保证。 |

完整类型以公开声明与源码为准；没有列出的功能不能通过猜测选项名开启。

## 共享图片表面与弹层

@filumo/image/view 导出 mountImageSurface、mountImageOverlay、ImageModel 和相关句柄。ImageModel.resolve(signal) 交付 URL 与 release 组成的本次显示租约，资源仍由宿主持有。

表面句柄提供 fit、actual、setScale、rotate、reset、retry、setActive、dispose；弹层也通过 dispose 释放。不要只删除节点而不释放句柄。本入口可以独立用于图库或其他附件预览。

## 解码边界

像素限制在获得自然尺寸后检查，不是浏览器开始解码前的内存保证。GIF/AVIF 等能否显示取决于浏览器原生解码。SVG 作为图片展示，不作为可执行内联文档。本包不提供图像编辑、裁剪保存、Canvas 转码，或 HEIC、TIFF 解码器。

## 样式与运行环境

默认 auto 模式随实际视图加载样式，通常不需要手动导入 CSS。若宿主选择 `stylePolicy: { mode: 'external' }`，在创建查看器前加载匹配版本的外部样式：

```ts
import '@filumo/dom/styles.css';
import '@filumo/image/styles.css';
```

本包使用浏览器原生解码，不提供 worker 或 workerFactory 配置，图片表面与弹层从公开 view 子入口按需加载。

字符串输入表示 URL，不表示文件正文；直接文本内容请使用 File/Blob。支持的来源还包括 Uint8Array、带 name/mimeType/request 的 URL 对象和自定义 DocumentSource 工厂。远程文件和辅助资源需要满足宿主的网络、CORS 与 CSP 配置。

包以 ESM 发布，包含 TypeScript 声明；不提供 CommonJS require 入口。查看器挂载、图片解码和文件选择在浏览器执行；导入轻量入口不等于支持在服务端渲染文件。宿主应在客户端生命周期创建实例，并在不再使用时销毁。

## 公开入口

| 公开入口 | 用途 |
| --- | --- |
| `@filumo/image` | image 工厂及公开配置类型 |
| `@filumo/image/styles.css` | 预编译外部样式资源，用于 external 样式模式 |
| `@filumo/image/view` | mountImageSurface、mountImageOverlay、图片模型与资源租约类型 |

未列出的包内路径不是稳定公共 API。独立格式不依赖 React/Vue 适配层，宿主只安装实际需要的格式和适配包。

## Filumo 包清单

当前包已加粗。每个包独立发布，包名链接到 npm，源码链接指向项目实际仓库。

<!-- filumo-packages:start -->

| 包（点击进入 npm） | 用途 | 源码说明 |
| --- | --- | --- |
| [@filumo/core](https://www.npmjs.com/package/@filumo/core) | 无 UI 的来源、插件协议、会话和公共文本处理 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/core#readme) |
| [@filumo/dom](https://www.npmjs.com/package/@filumo/dom) | 原生 DOM 查看器、工具栏、原文、大纲和共享 UI | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/dom#readme) |
| [@filumo/viewer](https://www.npmjs.com/package/@filumo/viewer) | 九类格式插件的标准预设与工厂聚合 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/viewer#readme) |
| [@filumo/office](https://www.npmjs.com/package/@filumo/office) | Word、Excel、PowerPoint 与受支持的旧格式 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/office#readme) |
| [@filumo/pdf](https://www.npmjs.com/package/@filumo/pdf) | PDF 连续阅读、大纲、缩略图和查找 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/pdf#readme) |
| **[@filumo/image](https://www.npmjs.com/package/@filumo/image)** | 图片预览、缩放、旋转、拖动及共享弹层 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/image#readme) |
| [@filumo/text](https://www.npmjs.com/package/@filumo/text) | 纯文本、日志、编码识别与可读文本兜底 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/text#readme) |
| [@filumo/json](https://www.npmjs.com/package/@filumo/json) | JSON / JSONC / JSONL / NDJSON 原文与结构 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/json#readme) |
| [@filumo/markdown](https://www.npmjs.com/package/@filumo/markdown) | Markdown 阅读、大纲、GFM 排版与代码高亮 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/markdown#readme) |
| [@filumo/csv](https://www.npmjs.com/package/@filumo/csv) | CSV / TSV 只读表格、虚拟滚动和查找 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/csv#readme) |
| [@filumo/xml](https://www.npmjs.com/package/@filumo/xml) | XML 原文、命名空间结构树和节点定位 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/xml#readme) |
| [@filumo/code](https://www.npmjs.com/package/@filumo/code) | 代码、脚本、配置及样式源码的只读高亮 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/code#readme) |
| [@filumo/react](https://www.npmjs.com/package/@filumo/react) | React 18/19 适配组件 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/react#readme) |
| [@filumo/vue](https://www.npmjs.com/package/@filumo/vue) | Vue 3（>=3.3 <4）适配组件 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/vue#readme) |
| [@filumo/vue2](https://www.npmjs.com/package/@filumo/vue2) | Vue 2（^2.6.14 或 ^2.7.16）适配组件 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/vue2#readme) |
<!-- filumo-packages:end -->

## 文档与反馈

- [本包源码与完整类型](https://github.com/gyxing/office-file-viewer/tree/master/packages/image/src)
- [框架接入指南](https://github.com/gyxing/office-file-viewer/blob/master/apps/docs/docs/guides/preview-integration.zh-CN.md)
- [格式能力与限制](https://github.com/gyxing/office-file-viewer/blob/master/apps/docs/docs/guides/compatibility.zh-CN.md)
- [文本类格式指南](https://github.com/gyxing/office-file-viewer/blob/master/apps/docs/docs/guides/text-formats.zh-CN.md)
- [图片与 PDF 部署](https://github.com/gyxing/office-file-viewer/blob/master/apps/docs/docs/guides/image-pdf.zh-CN.md)
- [独立框架示例](https://github.com/gyxing/office-file-viewer/tree/master/examples)
- [项目变更记录](https://github.com/gyxing/office-file-viewer/blob/master/CHANGELOG.md)
- [问题反馈](https://github.com/gyxing/office-file-viewer/issues)
- [MIT 许可证](https://github.com/gyxing/office-file-viewer/blob/master/packages/image/LICENSE)
