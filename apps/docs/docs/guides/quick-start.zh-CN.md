---
title: 快速开始
description: 安装、挂载和清理 Filumo 预览。
keywords:
  - Filumo
  - file preview
  - document viewer
siteLayout: docs
toc: content
---

# 快速开始

<a id="quick-start"></a>

<div className="filumo-doc-callout" data-kind="info">使用已发布包或工作区打包产物，源码版本与 npm 发布状态分别确认。</div>

## 安装与选包

使用 npm 上已发布的对应版本；发布前可使用工作区打包产物。插件数组应保持稳定。

```sh
npm install @filumo/react @filumo/viewer
```

## React 最小预览

```tsx | pure
import { DocumentViewer } from '@filumo/react';
import { standardPlugins } from '@filumo/viewer';
export function Preview({ file }: { file?: File }) {
  return <DocumentViewer source={file} plugins={standardPlugins} options={{ height: 640 }} onError={console.error} />;
}
```

普通接入无需导入 CSS。标准预设会安装其声明的全部格式依赖，但引擎、视图和资源仍按需加载；只需要少数格式时直接安装对应格式包。

## 原生 JavaScript

```ts | pure
import { createViewer } from '@filumo/dom';
import { standardPlugins } from '@filumo/viewer';
export async function mountPreview(container: HTMLElement, file: File) {
  const viewer = createViewer(container, { plugins: standardPlugins, height: 640, onError: console.error });
  await viewer.open(file);
  return () => viewer.destroy();
}
```

宿主卸载时调用返回的清理函数。字符串来源代表 URL；直接文本应使用 File、Blob 或自定义来源封装。

## 后续阅读

- [框架接入](./preview-integration)：Vue、React StrictMode 与 SSR。
- [完整支持格式](./compatibility)、[查看器 API](./viewer-api)、[格式插件参数](./plugin-api)。
- [生产部署](./deployment)与[问题排查](./troubleshooting)。
