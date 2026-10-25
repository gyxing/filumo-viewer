# @filumo/vue

<p>
<a href="https://github.com/gyxing/filumo-viewer/blob/master/packages/vue/README.md">English</a> | <strong>简体中文</strong> ·
<a href="https://gyxing.github.io/filumo-viewer/playground" target="_blank" rel="noopener noreferrer">在线示例</a> ·
<a href="https://gyxing.github.io/filumo-viewer/docs" target="_blank" rel="noopener noreferrer">对接文档</a>
</p>

Vue 3 的 Filumo 适配组件，使用 Composition API 和原生渲染函数，不需要为组件本身额外配置 SFC 编译插件。

本文档对应 **0.1.0**。以下命令展示 npm 发布后的消费方式；从当前源码工作区使用时，请先按接入指南构建各包。

## 主要能力

- 导出 DocumentViewer 及查看器配置、句柄类型，不自带格式插件。
- 支持 mounted/unmount 与 KeepAlive 激活、停用，复用框架无关 DOM 查看器。
- source、options 和 plugins 按声明同步，插件列表应保持稳定。

## 安装

```sh
pnpm add @filumo/vue @filumo/office
# 或使用 npm
npm install @filumo/vue @filumo/office
```

示例放在已配置相应框架的宿主项目中，框架版本范围见下文。

## 最小接入

```vue
<script setup lang="ts">
import { shallowRef } from 'vue';
import { DocumentViewer } from '@filumo/vue';
import { office } from '@filumo/office';

const file = shallowRef<File>();
const plugins = [office()];
const options = { height: 640 };
function chooseFile(event: Event) {
  file.value = (event.target as HTMLInputElement).files?.[0];
}
function onError(error: Error) {
  console.error(error);
}
</script>

<template>
  <section>
    <input type="file" @change="chooseFile" />
    <DocumentViewer
      :source="file"
      :plugins="plugins"
      :options="options"
      @error="onError"
    />
  </section>
</template>
```

## 常用配置

| 配置项                             | 默认值       | 说明                                                                         |
| ---------------------------------- | ------------ | ---------------------------------------------------------------------------- |
| `source`                           | 可不设置     | 浏览器文档输入。                                                             |
| `plugins`                          | 必填         | 格式插件数组；保持稳定引用。                                                 |
| `options`                          | 默认外壳配置 | ViewerConfiguration，含高度、主题、语言和资源限制。                          |
| `ready / error`                    | 事件         | 会话就绪或加载错误。                                                         |
| `stateChange / capabilitiesChange` | 事件         | 状态及格式能力变化。                                                         |
| `组件 ref`                         | 可选         | 暴露 open、update、getSnapshot、getCapabilities、setActive、destroy 等方法。 |

完整类型以公开声明与源码为准；没有列出的功能不能通过猜测选项名开启。

## 生命周期与框架版本

peerDependencies 为 vue >=3.3 <4。示例使用 SFC 展示宿主写法，组件本身使用渲染函数。通过组件 ref 调用公开方法时等待 onMounted，不访问内部 viewer 字段。

KeepAlive 停用暂停视图，恢复继续使用会话，beforeUnmount 释放实例。插件列表保持稳定，避免深度代理解析器和 Worker 等运行时对象；SSR 不提前创建浏览器查看器。

## 格式选择与样式

示例只注册 Office。完整预设需要直接安装 @filumo/viewer 并传入 standardPlugins；适配器本身不注册格式。PDF 默认使用包内同版资源，只有自定义外部部署才需要提供资源目录。

auto 模式由 DOM 与格式加载样式；external 模式导入 @filumo/dom/styles.css 和实际格式 styles.css，Office 图片弹层另需 Image CSS。Vue 适配包没有独立 styles.css。

## 输入与运行环境

字符串输入表示 URL，不表示文件正文；直接文本内容请使用 File/Blob。支持的来源还包括 Uint8Array、带 name/mimeType/request 的 URL 对象和自定义 DocumentSource 工厂。远程文件和辅助资源需要满足宿主的网络、CORS 与 CSP 配置。

包以 ESM 发布，包含 TypeScript 声明；不提供 CommonJS require 入口。查看器挂载、图片解码和文件选择在浏览器执行；导入轻量入口不等于支持在服务端渲染文件。宿主应在客户端生命周期创建实例，并在不再使用时销毁。

## 公开入口

| 公开入口      | 用途                                                                              |
| ------------- | --------------------------------------------------------------------------------- |
| `@filumo/vue` | DocumentViewer 组件，以及 DocumentInput、ViewerHandle、ViewerConfiguration 等类型 |

未列出的包内路径不是稳定公共 API。独立格式不依赖 React/Vue 适配层，宿主只安装实际需要的格式和适配包。

## Filumo 包清单

当前包已加粗。每个包独立发布，包名链接到 npm，源码链接指向项目实际仓库。

<!-- filumo-packages:start -->

| 包（点击进入 npm）                                                 | 用途                                         | 源码说明                                                                                        |
| ------------------------------------------------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [@filumo/core](https://www.npmjs.com/package/@filumo/core)         | 无 UI 的来源、插件协议、会话和公共文本处理   | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/core/README.zh-CN.md)     |
| [@filumo/dom](https://www.npmjs.com/package/@filumo/dom)           | 原生 DOM 查看器、工具栏、原文、大纲和共享 UI | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/dom/README.zh-CN.md)      |
| [@filumo/viewer](https://www.npmjs.com/package/@filumo/viewer)     | 九类格式插件的标准预设与工厂聚合             | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/viewer/README.zh-CN.md)   |
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
| **[@filumo/vue](https://www.npmjs.com/package/@filumo/vue)**       | Vue 3（>=3.3 <4）适配组件                    | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/vue/README.zh-CN.md)      |
| [@filumo/vue2](https://www.npmjs.com/package/@filumo/vue2)         | Vue 2（^2.6.14 或 ^2.7.16）适配组件          | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/vue2/README.zh-CN.md)     |

<!-- filumo-packages:end -->

## 文档与反馈

- [本包源码与完整类型](https://github.com/gyxing/filumo-viewer/tree/master/packages/vue/src)
- [框架接入指南](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/preview-integration.zh-CN.md)
- [格式能力与限制](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/compatibility.zh-CN.md)
- [文本类格式指南](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/text-formats.zh-CN.md)
- [图片与 PDF 部署](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/image-pdf.zh-CN.md)
- [独立框架示例](https://github.com/gyxing/filumo-viewer/tree/master/examples)
- [项目变更记录](https://github.com/gyxing/filumo-viewer/blob/master/CHANGELOG.md)
- [问题反馈](https://github.com/gyxing/filumo-viewer/issues)
- [MIT 许可证](https://github.com/gyxing/filumo-viewer/blob/master/packages/vue/LICENSE)
