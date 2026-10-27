# @filumo/viewer

<p>
<a href="https://github.com/gyxing/filumo-viewer/blob/master/packages/viewer/README.md">English</a> | <strong>简体中文</strong> ·
<a href="https://gyxing.github.io/filumo-viewer/playground" target="_blank" rel="noopener noreferrer">在线示例</a> ·
<a href="https://gyxing.github.io/filumo-viewer/docs" target="_blank" rel="noopener noreferrer">对接文档</a>
</p>

Filumo 十类格式插件的标准预设与工厂聚合入口。适合需要完整格式支持的宿主，实际查看器仍由 DOM 或框架适配包创建。

本文档对应 **0.1.0**。以下命令展示 npm 发布后的消费方式；从当前源码工作区使用时，请先按接入指南构建各包。

## 主要能力

- standardPlugins 是只读插件数组，不是需要调用的函数。
- 聚合 Office、Text、JSON、Markdown、Image、PDF、CSV、XML、Code、Archive，格式实现仍在打开对应文件后加载。
- 安装本包会安装所有格式依赖；只需要部分格式时，分别安装并注册对应的独立包。

## 安装

```sh
pnpm add @filumo/dom @filumo/viewer
# 或使用 npm
npm install @filumo/dom @filumo/viewer
```

## 最小接入

```html
<div id="viewer"></div>
<button id="dispose" type="button">关闭预览</button>
```

```ts
import { createViewer } from '@filumo/dom';
import { standardPlugins } from '@filumo/viewer';

const container = document.getElementById('viewer');
if (!container) throw new Error('缺少预览容器');
const viewer = createViewer(container, {
  plugins: standardPlugins,
  height: 640,
  onError: (error) => console.error(error),
});

try {
  await viewer.open(new File(['# Filumo\n\n多格式文档预览'], 'example.md'));
} catch (error) {
  console.error(error);
}
document.getElementById('dispose')?.addEventListener('click', () => {
  void viewer.destroy();
});
window.addEventListener(
  'pagehide',
  () => {
    void viewer.destroy();
  },
  { once: true },
);
```

将示例 URL 换成真实可访问的文件地址，或在文件选择事件中传入 File。20 MiB 等示例限制是宿主配置，不是库默认限制；关闭时由句柄释放会话、资源与样式租约。

## 常用配置

| 配置项                                                             | 默认值             | 说明                                                                          |
| ------------------------------------------------------------------ | ------------------ | ----------------------------------------------------------------------------- |
| `standardPlugins`                                                  | 十个插件的只读数组 | 传给 createViewer 或 DocumentViewer 的 plugins；不要写成 standardPlugins()。  |
| `office / pdf / image / text / json / markdown / csv / xml / code` | 对应工厂           | 按需配置单个插件，或用于替换标准数组中的某个实例。                            |
| `查看器配置`                                                       | 由外壳提供         | height、theme、locale、resourcePolicy 等传给 DOM 或适配组件，不传给本包数组。 |

完整类型以公开声明与源码为准；没有列出的功能不能通过猜测选项名开启。

## 自定义预设与加载方式

standardPlugins 是只读数组，不是函数。安装本包包含全部格式依赖，但导入轻量描述符不代表已经加载全部引擎；实际实现按打开的格式加载。

需要自定义 PDF 资产位置时，可以替换标准数组中的 PDF 实例，避免重复注册相同插件 ID：

```ts
import { standardPlugins, pdf } from '@filumo/viewer';

const plugins = [
  ...standardPlugins.filter((plugin) => plugin.document.id !== 'pdf'),
  pdf({ assetsBaseUrl: '/filumo-pdf/' }),
];
```

plugins 交给 DOM 或适配组件。标准数组内的 pdf() 默认使用包内资源；上例选择自定义 assetsBaseUrl 时，宿主才负责该外部目录的部署。只需要部分格式时，请直接安装对应格式包。

## 样式与资源

默认使用各格式的自动样式。external 模式加载 DOM、Office、Text、JSON、Markdown、Image、PDF、CSV、XML、Code、Archive 的 styles.css；本包不存在 @filumo/viewer/styles.css。

选择 external 时，宿主应将实际导入样式的包声明为直接依赖，不依赖包管理器的依赖提升。默认 auto 接入不需要为了导入这些样式再逐个安装格式包。

Worker 需要保留所属包 worker.js 与 worker-chunks 的相对结构；PDF 默认集成同版本引擎、字体、CMap、WASM、ICC 和文字层样式，外部资源覆盖是可选高级配置。本包不包含编辑、保存、OCR 或转换，也不导出 createViewer，createViewer 来自 DOM 包。

## 输入与运行环境

字符串输入表示 URL，不表示文件正文；直接文本内容请使用 File/Blob。支持的来源还包括 Uint8Array、带 name/mimeType/request 的 URL 对象和自定义 DocumentSource 工厂。远程文件和辅助资源需要满足宿主的网络、CORS 与 CSP 配置。

包以 ESM 发布，包含 TypeScript 声明；不提供 CommonJS require 入口。查看器挂载、图片解码和文件选择在浏览器执行；导入轻量入口不等于支持在服务端渲染文件。宿主应在客户端生命周期创建实例，并在不再使用时销毁。

## 公开入口

| 公开入口         | 用途                                   |
| ---------------- | -------------------------------------- |
| `@filumo/viewer` | standardPlugins 只读数组与十个格式工厂 |

未列出的包内路径不是稳定公共 API。独立格式不依赖 React/Vue 适配层，宿主只安装实际需要的格式和适配包。

## Filumo 包清单

当前包已加粗。每个包独立发布，包名链接到 npm，源码链接指向项目实际仓库。

<!-- filumo-packages:start -->

| 包（点击进入 npm）                                                 | 用途                                         | 源码说明                                                                                        |
| ------------------------------------------------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [@filumo/core](https://www.npmjs.com/package/@filumo/core)         | 无 UI 的来源、插件协议、会话和公共文本处理   | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/core/README.zh-CN.md)     |
| [@filumo/dom](https://www.npmjs.com/package/@filumo/dom)           | 原生 DOM 查看器、工具栏、原文、大纲和共享 UI | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/dom/README.zh-CN.md)      |
| **[@filumo/viewer](https://www.npmjs.com/package/@filumo/viewer)** | 十类格式插件的标准预设与工厂聚合             | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/viewer/README.zh-CN.md)   |
| [@filumo/office](https://www.npmjs.com/package/@filumo/office)     | Word、Excel、PowerPoint 与受支持的旧格式     | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/office/README.zh-CN.md)   |
| [@filumo/pdf](https://www.npmjs.com/package/@filumo/pdf)           | PDF 连续阅读、大纲、缩略图和查找             | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/pdf/README.zh-CN.md)      |
| [@filumo/image](https://www.npmjs.com/package/@filumo/image)       | 图片预览、缩放、旋转、拖动及共享弹层         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/image/README.zh-CN.md)    |
| [@filumo/text](https://www.npmjs.com/package/@filumo/text)         | 纯文本、日志、编码识别与可读文本兜底         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/text/README.zh-CN.md)     |
| [@filumo/json](https://www.npmjs.com/package/@filumo/json)         | JSON / JSONC / JSONL / NDJSON 原文与结构     | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/json/README.zh-CN.md)     |
| [@filumo/markdown](https://www.npmjs.com/package/@filumo/markdown) | Markdown 阅读、大纲、GFM 排版与代码高亮      | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/markdown/README.zh-CN.md) |
| [@filumo/csv](https://www.npmjs.com/package/@filumo/csv)           | CSV / TSV 只读表格、虚拟滚动和查找           | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/csv/README.zh-CN.md)      |
| [@filumo/xml](https://www.npmjs.com/package/@filumo/xml)           | XML 原文、命名空间结构树和节点定位           | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/xml/README.zh-CN.md)      |
| [@filumo/code](https://www.npmjs.com/package/@filumo/code)         | 代码、脚本、配置及样式源码的只读高亮         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/code/README.zh-CN.md)     |
| [@filumo/react](https://www.npmjs.com/package/@filumo/react)       | React 18/19 适配组件                         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/react/README.zh-CN.md)    |
| [@filumo/vue](https://www.npmjs.com/package/@filumo/vue)           | Vue 3（>=3.3 <4）适配组件                    | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/vue/README.zh-CN.md)      |
| [@filumo/vue2](https://www.npmjs.com/package/@filumo/vue2)         | Vue 2（^2.6.14 或 ^2.7.16）适配组件          | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/vue2/README.zh-CN.md)     |
| [@filumo/archive](https://www.npmjs.com/package/@filumo/archive)   | 压缩包目录、按需提取与包内预览               | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/archive/README.zh-CN.md)  |

<!-- filumo-packages:end -->

## 文档与反馈

- [本包源码与完整类型](https://github.com/gyxing/filumo-viewer/tree/master/packages/viewer/src)
- [框架接入指南](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/preview-integration.zh-CN.md)
- [格式能力与限制](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/compatibility.zh-CN.md)
- [文本类格式指南](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/text-formats.zh-CN.md)
- [图片与 PDF 部署](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/image-pdf.zh-CN.md)
- [独立框架示例](https://github.com/gyxing/filumo-viewer/tree/master/examples)
- [项目变更记录](https://github.com/gyxing/filumo-viewer/blob/master/CHANGELOG.md)
- [问题反馈](https://github.com/gyxing/filumo-viewer/issues)
- [MIT 许可证](https://github.com/gyxing/filumo-viewer/blob/master/packages/viewer/LICENSE)
