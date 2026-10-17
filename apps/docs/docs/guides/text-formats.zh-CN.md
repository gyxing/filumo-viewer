---
title: 纯文本、JSON 与 Markdown
siteLayout: docs
toc: content
---

# 纯文本、JSON 与 Markdown

三个插件共用现有 DOM 外壳和框架适配器，不需要安装新的 React/Vue 专用组件。

```ts
import { createViewer } from '@fivo/dom';
import { text } from '@fivo/text';
import { json } from '@fivo/json';
import { markdown } from '@fivo/markdown';

const viewer = createViewer(container, {
  plugins: [text(), json(), markdown()],
  resourcePolicy: { maxFileBytes: 20 * 1024 * 1024 },
});
await viewer.open(new File(['第一行\n第二行'], 'sample.txt'));
```

普通字符串仍表示 URL；直接文本内容应使用 File、Blob 或来源工厂。下载始终保存原文件字节。

## 编码与原文

自动模式依次使用 BOM、来源 MIME 中的 charset、明显的 UTF-16 字节特征、严格 UTF-8 和 GB18030 解码，覆盖常见 GBK 文件。识别成功后直接显示正文，编码控件展示实际编码；缺少声明时属于内容推断，仍可手动纠正，非法字节或明显非文本内容保留编码选择入口。手动指定编码优先，切换或重新选择自动均从当前原始字节解码，不再次下载。

Text 默认接管 TXT、LOG、INI、CONF、CFG、PROPERTIES、OUT，默认隐藏行号并启用自动换行；可在插件选项中配置 extensions、lineNumbers、wrap，或从更多操作菜单开启行号。

编码、视图切换、查找、自动换行和行号按当前格式收纳到更多操作菜单。Markdown 大纲保留在主工具栏；JSON 使用同一个按钮展开或收起当前选中分支，普通值及空容器不可切换。JSON、Markdown 的原文视图同样默认隐藏行号。

JSON 支持结构和原文模式，原始数字及重复键按源范围保留。默认展开两层，maxDepth 默认 256、maxNodes 默认 200000。错误 JSON 保持可查看原文，不自动伪装成 TXT。

JSON 默认在宽容器显示原生只读双栏，左侧是带语法颜色的原文，右侧结构树使用连接线、加减号和 Object/Array 数量摘要。点击节点可定位原文；收起结构区后原文铺满。小于 720px 的容器一次显示一个区域，原有 `initialMode: 'tree'` 配置值继续有效。结构解析失败时保留原文与诊断；单独原文只加载轻量行着色，不加载结构扫描器。单行超过 65536 个 UTF-16 代码单元时跳过着色，完整内容仍可阅读。

Markdown 支持基础排版、GFM 表格、任务列表、删除线、代码高亮、大纲和原文；不包含公式、Mermaid 或编辑器。常用原生 HTML 在阅读视图中受控呈现，包括表格合并、链接、图片、文字格式、标题和 details 折叠内容；HTML 标题和自定义锚点参与正文内定位。标签、属性和局部样式经过限制，脚本、事件属性、全局样式及嵌入页面不会进入阅读视图。代码中的 HTML 保持字面内容。

```ts
const plugins = [
  text({ encoding: 'auto', wrap: true }),
  json({ initialMode: 'source' }),
  markdown({ initialMode: 'reading', highlight: true, maxHighlightChars: 65536 }),
];
```

## 按需加载与依赖

注册插件只创建轻量描述符。JSON/Markdown 初始原文模式只加载读取和原文视图，进入结构/阅读模式才解析；Worker 内部同样保持动态任务边界。

纯文本、JSON 不新增第三方运行时依赖。Markdown 仅使用 marked 和 highlight.js；可见且已支持语言的代码块才加载高亮核心和该语言，未知语言、关闭高亮或超过预算时保留完整普通代码。

HTML 片段渲染只在解析结果含真实 HTML token 时加载；行内代码或代码块中的标签不会触发该模块。HTML 图片复用资源解析与懒加载，链接和图片遵循相同的协议及生命周期约束。

安装标准预设会安装其全部格式依赖；运行时懒加载不等于 npm 按未来打开的文件安装包。只需要原文或 JSON 时可以仅安装对应格式包。

`@fivo/text/reader` 提供不访问 DOM 的 readText、行索引和查找能力；`@fivo/text/view` 是独立原文视图入口。格式样式随视图持有租约，也可以由宿主显式加载对应 styles.css 后使用 external 样式模式。

## 资源与生命周期

Markdown 相对链接和图片使用远端文档地址或显式 baseUrl；本机文件不猜测磁盘目录，可通过 resolveResource 回调指定地址。链接和图片仍执行协议检查，图片在可见时请求。

worker 可设置 auto、always、never，也可指定 workerFactory。Worker 在真实任务开始时创建，取消和销毁使旧结果失效；主线程模式不承诺同步第三方解析可在执行中抢占。

新格式的 Worker 使用 ESM 动态分块。Vite 宿主需要设置 `worker: { format: 'es' }`；手动部署 Worker 时要同时发布 `worker.js` 与它引用的 `worker-chunks` 目录，保留相对路径。

原文窗口化和结构树窗口化控制 DOM 数量，不意味着读取或解析内存无限。宿主应通过 resourcePolicy 限制输入，结构与高亮另有相应处理预算。
