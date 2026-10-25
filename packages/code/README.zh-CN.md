# @filumo/code

<p>
<a href="https://github.com/gyxing/filumo-viewer/blob/master/packages/code/README.md">English</a> | <strong>简体中文</strong> ·
<a href="https://gyxing.github.io/filumo-viewer/playground" target="_blank" rel="noopener noreferrer">在线示例</a> ·
<a href="https://gyxing.github.io/filumo-viewer/docs" target="_blank" rel="noopener noreferrer">对接文档</a>
</p>

独立代码预览插件，为常用语言、脚本、构建文件、配置及样式源码提供只读原文、高亮、查找和行号。

本文档对应 **0.1.0**。以下命令展示 npm 发布后的消费方式；从当前源码工作区使用时，请先按接入指南构建各包。

## 主要能力

- 默认显示真实行号并自动换行，可从更多菜单切换行号、换行、编码和语言。
- 常用语言及语法模块按需加载，高亮在专用 Worker 中执行；不可用、超预算或关闭时继续显示可读原文。
- 支持无后缀构建文件和 .env 变体；HTML、CSS、LESS、SCSS、Sass 只展示源码，不执行或应用到页面。

## 安装

```sh
pnpm add @filumo/dom @filumo/code
# 或使用 npm
npm install @filumo/dom @filumo/code
```

## 最小接入

```html
<div id="viewer"></div>
<button id="dispose" type="button">关闭预览</button>
```

```ts
import { createViewer } from '@filumo/dom';
import { code } from '@filumo/code';

const container = document.getElementById('viewer');
if (!container) throw new Error('缺少预览容器');

const viewer = createViewer(container, {
  plugins: [code()],
  height: 640,
  locale: 'zh-CN',
  resourcePolicy: { maxFileBytes: 20 * 1024 * 1024 },
  onError: (error) => console.error(error),
});

try {
  await viewer.open(
    new File(
      ['const message: string = "Filumo";\nconsole.log(message);'],
      'example.ts',
    ),
  );
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

| 配置项                   | 默认值             | 说明                                                      |
| ------------------------ | ------------------ | --------------------------------------------------------- |
| `language`               | auto               | 根据文件名和后缀选语法，或显式选择支持的语言、plaintext。 |
| `encoding`               | auto               | 源文件解码方式。                                          |
| `worker / workerFactory` | auto / 内置 Worker | never 会关闭高亮，仍保留原文预览。                        |
| `maxHighlightChars`      | 262,144            | 参与高亮增强的文件字符上限。                              |
| `maxHighlightRanges`     | 100,000            | 高亮装饰区间预算。                                        |
| `highlightTimeout`       | 5,000ms            | 增强任务超时后回退到原文。                                |

完整类型以公开声明与源码为准；没有列出的功能不能通过猜测选项名开启。

## 支持的代码与配置

| 类别                    | 语法与文件                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------ |
| JavaScript / TypeScript | JS、MJS、CJS、JSX、TS、MTS、CTS、TSX                                                 |
| 标记与样式源码          | HTML/HTM、CSS、LESS、SCSS、Sass                                                      |
| 脚本与通用语言          | Shell/Bash/Zsh、Python、SQL、Java、C、C++、C#、Go、Rust                              |
| 扩展语言                | PHP、Ruby/Rake、Kotlin、Swift、Lua                                                   |
| 配置与构建              | YAML/YML、TOML、PowerShell、Batch/CMD、Dockerfile、Makefile/GNUmakefile、CMake、.env |
| 接口与变更              | GraphQL/GQL、Protocol Buffers、Diff/Patch                                            |

`Dockerfile.*`、`*.dockerfile`、`.env.*`、`CMakeLists.txt` 等完整文件名参与识别；专用后缀仍归对应插件，例如 `.env.json` 由 JSON 处理。普通 INI/CONF/CFG/Properties 留给 Text。`.h` 默认按 C 高亮，可手动切换 C++。

## 高亮与执行边界

高亮仅在独立 Worker 中增强。worker: 'never'、Worker 不可用、超时或超预算时保留原文，不在主线程执行相同重型增强作为回退。语法按语言加载，不预加载全部语言。

TOML 复用 INI 语法，YAML 加载上游需要的 Ruby，Dockerfile 加载 Shell；PHP 支持裸代码和带标签模板。.env 变量和命令只着色，不展开。HTML、CSS、LESS、SCSS、Sass 不执行或应用到页面。不提供编译器、语言服务器、格式化、代码执行或 Vue/Svelte 混合语法。

## 样式与运行环境

默认 auto 模式随实际视图加载样式，通常不需要手动导入 CSS。若宿主选择 `stylePolicy: { mode: 'external' }`，在创建查看器前加载匹配版本的外部样式：

```ts
import '@filumo/dom/styles.css';
import '@filumo/code/styles.css';
```

模块 Worker 部署时保留本包 worker.js 和 worker-chunks 的相对结构，打包器无法自动处理时通过 workerFactory 创建。worker: 'never' 关闭高亮；其他模式尝试独立 Worker，失败或超预算时继续显示原文，不回退到主线程执行同样的增强。

字符串输入表示 URL，不表示文件正文；直接文本内容请使用 File/Blob。支持的来源还包括 Uint8Array、带 name/mimeType/request 的 URL 对象和自定义 DocumentSource 工厂。远程文件和辅助资源需要满足宿主的网络、CORS 与 CSP 配置。

包以 ESM 发布，包含 TypeScript 声明；不提供 CommonJS require 入口。查看器挂载、图片解码和文件选择在浏览器执行；导入轻量入口不等于支持在服务端渲染文件。宿主应在客户端生命周期创建实例，并在不再使用时销毁。

## 公开入口

| 公开入口                  | 用途                                                     |
| ------------------------- | -------------------------------------------------------- |
| `@filumo/code`            | code 工厂及公开配置类型                                  |
| `@filumo/code/styles.css` | 预编译外部样式资源，用于 external 样式模式               |
| `@filumo/code/worker.js`  | 模块 Worker 资源；部署时保留相关分块，不作为普通函数导入 |

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
| **[@filumo/code](https://www.npmjs.com/package/@filumo/code)**     | 代码、脚本、配置及样式源码的只读高亮         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/code/README.zh-CN.md)     |
| [@filumo/react](https://www.npmjs.com/package/@filumo/react)       | React 18/19 适配组件                         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/react/README.zh-CN.md)    |
| [@filumo/vue](https://www.npmjs.com/package/@filumo/vue)           | Vue 3（>=3.3 <4）适配组件                    | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/vue/README.zh-CN.md)      |
| [@filumo/vue2](https://www.npmjs.com/package/@filumo/vue2)         | Vue 2（^2.6.14 或 ^2.7.16）适配组件          | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/vue2/README.zh-CN.md)     |

<!-- filumo-packages:end -->

## 文档与反馈

- [本包源码与完整类型](https://github.com/gyxing/filumo-viewer/tree/master/packages/code/src)
- [框架接入指南](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/preview-integration.zh-CN.md)
- [格式能力与限制](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/compatibility.zh-CN.md)
- [文本类格式指南](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/text-formats.zh-CN.md)
- [图片与 PDF 部署](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/image-pdf.zh-CN.md)
- [独立框架示例](https://github.com/gyxing/filumo-viewer/tree/master/examples)
- [项目变更记录](https://github.com/gyxing/filumo-viewer/blob/master/CHANGELOG.md)
- [问题反馈](https://github.com/gyxing/filumo-viewer/issues)
- [MIT 许可证](https://github.com/gyxing/filumo-viewer/blob/master/packages/code/LICENSE)
