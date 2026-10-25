---
title: Filumo 框架接入指南
description: React 18/19、Vue 3、Vue 2 与原生 JavaScript 的 Filumo 接入、稳定插件配置及生命周期。
keywords:
  - Filumo
  - file preview
  - document viewer
  - 文件预览
siteLayout: docs
toc: content
---

# 框架接入指南

本页分别给出 React、Vue 3、Vue 2 和原生 JavaScript 示例。各格式复用 DOM 外壳、默认工具栏与自动样式，框架选择只影响挂载及生命周期适配。下面先用 Office 展示最小接入，再说明九类格式预设。

## 开始前

实际发布版本以各包 npm 页面为准；发布前可使用工作区打包产物。在仓库内先执行 pnpm install --frozen-lockfile 和 pnpm build，然后用 pnpm demo:react、demo:vue3、demo:vue2、demo:js 运行独立宿主。

外部项目试用应使用本地打包产物，而不是只链接某个包的 src：pnpm test:consumers 会构建独立安装环境、打包全部 workspace 依赖并验证实际消费；打包位置记录在 tmp/testing/consumers.json。该流程不执行 npm 发布。发布后按自己的框架选择适配器与所需格式包，完整组合见[包总览](./packages)。

普通模式不需要导入 CSS。不引入其他框架适配器，就不会因 Office 引入对应框架。

## React 18 / 19

```tsx | pure
import { useRef } from 'react';
import { DocumentViewer } from '@filumo/react';
import { office } from '@filumo/office';
import type { ViewerHandle } from '@filumo/react';

const plugins = [office({ worker: 'auto' })];

export function OfficePreview({ file }: { file?: File }) {
  const handle = useRef<ViewerHandle>(null);
  return (
    <section>
      <button
        onClick={() => void handle.current?.getCapabilities().zoom?.set(125)}
      >
        125%
      </button>
      <DocumentViewer
        ref={handle}
        source={file}
        plugins={plugins}
        options={{ height: 640, locale: 'zh-CN' }}
        onReady={(session) => console.info(session.getSnapshot())}
        onError={(error) => console.error(error)}
      />
    </section>
  );
}
```

动态 Office 配置可用 useMemo(() => [office(options)], [options])，但 options 本身也要稳定。创建策略变更会重建实例；简单主题、尺寸、缩放更新使用组件 options 或 handle.update。

使用 React StrictMode 时不应依赖 effect 只执行一次；适配器负责幂等清理。不要在 render 中创建查看器。

## Vue 3

```vue | pure
<script setup lang="ts">
import { shallowRef } from 'vue';
import { DocumentViewer } from '@filumo/vue';
import { office } from '@filumo/office';
import type { ViewerHandle } from '@filumo/vue';

defineProps<{ file?: File }>();
const handle = shallowRef<ViewerHandle>();
const plugins = [office()];
const options = { height: 640, locale: 'zh-CN' as const };
function onError(error: Error) {
  console.error(error);
}
</script>

<template>
  <DocumentViewer
    ref="handle"
    :source="file"
    :plugins="plugins"
    :options="options"
    @error="onError"
  />
</template>
```

组件暴露 ViewerHandle 方法。需要订阅时在挂载后取得 handle.value，并在宿主卸载时取消自己的订阅。KeepAlive 的激活与停用由适配器转为 setActive，不需要销毁重建文件。

## Vue 2.6 / 2.7

以下为 Options API 示例，不依赖 script setup。

```vue | pure
<script>
import { DocumentViewer } from '@filumo/vue2';
import { office } from '@filumo/office';

const plugins = Object.freeze([office()]);
export default {
  components: { DocumentViewer },
  props: { file: { default: undefined } },
  data() {
    return { plugins, options: { height: 640, locale: 'zh-CN' } };
  },
  methods: {
    onError(error) {
      console.error(error);
    },
    zoomIn() {
      return this.$refs.preview.getCapabilities().zoom?.set(125);
    },
  },
};
</script>

<template>
  <DocumentViewer
    ref="preview"
    :source="file"
    :plugins="plugins"
    :options="options"
    @error="onError"
  />
</template>
```

plugins 使用稳定的冻结数组，不将会话或查看器对象放进 data。JS 示例中的可选链需要宿主编译器支持；Vue 2 兼容不代表旧浏览器或旧构建器无需配置。

## 原生 JavaScript 与自定义按钮

```ts | pure
import { createViewer } from '@filumo/dom';
import { office } from '@filumo/office';

export function mountPreview(
  container: HTMLElement,
  file: File,
  zoomButton: HTMLButtonElement,
) {
  const viewer = createViewer(container, {
    plugins: [office()],
    height: 640,
    toolbar: false,
    onError: (error) => console.error(error),
  });
  const sync = () => {
    zoomButton.disabled = !viewer.getCapabilities().zoom;
  };
  const unsubscribe = viewer.subscribeCapabilities(sync);
  const zoom = () => {
    const capability = viewer.getCapabilities().zoom;
    if (capability)
      void capability
        .set(Math.min(capability.max, capability.value + capability.step))
        .catch(console.error);
  };
  zoomButton.addEventListener('click', zoom);
  sync();
  void viewer.open(file).catch(console.error);
  return async () => {
    unsubscribe();
    zoomButton.removeEventListener('click', zoom);
    await viewer.destroy();
  };
}
```

宿主负责让 container 高度可计算。方法返回的清理函数应在页面卸载时调用；不要在打开后立即调用。

## 标准插件预设

```tsx | pure
import { DocumentViewer } from '@filumo/react';
import { standardPlugins } from '@filumo/viewer';
export function Preview({ file }: { file?: File }) {
  return (
    <DocumentViewer
      source={file}
      plugins={standardPlugins}
      options={{ height: 640 }}
    />
  );
}
```

standardPlugins 是冻结的 Office、Text、JSON、Markdown、Image、PDF、CSV、XML、Code 九类描述符数组。需要格式专属参数时使用自己的稳定插件数组；PDF 资源部署见 [图片与 PDF 指南](./image-pdf)。@filumo/viewer 不会自动导入 React/Vue 组件，也不会提前加载格式引擎。

## 自定义来源工厂

来源工厂用于动态请求或自定义缓存，返回当前合同的 DocumentSource，而非 Response。每次调用应返回新租约。

```ts | pure
import type { DocumentSource } from '@filumo/core';

const sourceFactory = (): DocumentSource => ({
  name: 'report.docx',
  async readAll(signal) {
    const response = await fetch('/api/report', {
      signal,
      credentials: 'include',
    });
    if (!response.ok) throw new Error('文件请求失败：' + response.status);
    return new Uint8Array(await response.arrayBuffer());
  },
  async dispose() {
    // 释放此来源独占的缓存或句柄；本例没有额外资源。
  },
});
await viewer.open(sourceFactory);
```

可选 readRange(offset, length, signal) 用于按范围读取；当前 Office 驱动仍可能需要完整文件。readAll/readRange 应遵守 AbortSignal，dispose 应幂等。

## 超链接、字体和资源

```ts | pure
const plugins = [
  office({
    fonts: {
      aliases: { 'Company Font': ['Arial', 'sans-serif'] },
      fallbackFamilies: ['sans-serif'],
      sources: [
        {
          family: 'Company Font',
          src: 'url("/fonts/company.woff2") format("woff2")',
        },
      ],
      warnOnMissing: true,
    },
    media: { allowExternal: false, download: true },
    onHyperlinkActivate(event) {
      if (event.hyperlink.kind !== 'internal') event.preventDefault();
    },
    onWarning(warning) {
      console.warn(warning.code, warning.message);
    },
  }),
];
```

字体由宿主部署且须具有合法授权。下载或外部链接策略由业务决定；preventDefault 阻止默认导航，但不会放宽危险 URL 策略。完整参数、CSP 和 Worker 说明见概览与 API。

## SSR 客户端边界

Next.js 可使用客户端组件。模块顶层只创建轻量描述符，不在服务端渲染期间打开文件或创建查看器。

```tsx | pure
'use client';
import { DocumentViewer } from '@filumo/react';
import { standardPlugins } from '@filumo/viewer';
export function FilePreview({ url }: { url: string }) {
  return <DocumentViewer source={url} plugins={standardPlugins} options={{ height: 640 }} />;
}
```

Nuxt 可把包装组件命名为 .client.vue，或放入 ClientOnly，内部沿用上方 Vue 3 示例。这些配方不代表所有 Next.js/Nuxt 版本均已完成验收。

## 常见接入错误

- 页面空白：确认容器高度、source 类型和 onError，而不是反复添加 CSS。
- 频繁重新加载：检查 plugins 是否每次渲染创建新数组，或创建策略是否不断变化。
- Vue 事件不触发：区分 Vue 的 ready/error 与 React 的 onReady/onError。
- 重复解析：不要同时通过 source 和 handle.open 驱动同一文件。
- 销毁后无法再打开：创建新实例；destroy 是终止生命周期。
- 特殊 CSP/Worker 部署：使用明确的 nonce 或 workerFactory，并验证真实生产资源 URL。

## 多格式接入与部署

上述 Office 示例是最小接入，不限制查看器只能预览 Office。完整十五包清单与安装组合见[包总览](./packages)。可分别导入 text、json、markdown、image、pdf、csv、xml、code，或从 @filumo/viewer 取得这些工厂并构建稳定数组。

PDF 默认使用包内同版资源，普通接入直接使用 pdf()。assetsBaseUrl、cMapUrl、standardFontDataUrl、wasmUrl 和 iccUrl 仅用于宿主选择自定义部署；在线体验不再填入本站的资源地址。

样式默认自动加载。external 模式直接安装并导入 @filumo/dom/styles.css 及启用格式的 styles.css；Office 图片弹层还需 @filumo/image/styles.css。React/Vue 适配器与标准预设没有独立 styles.css。详见[文本与结构化格式](./text-formats)和[图片与 PDF](./image-pdf)。
