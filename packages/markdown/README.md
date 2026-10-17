# @fivo/markdown

框架无关的只读预览插件，配合 @fivo/dom 或已有框架适配器使用。

```ts
import { markdown } from '@fivo/markdown';
const plugins = [markdown()];
```

工厂只注册格式描述符，驱动、视图、Worker、样式按需加载。自动编码结合 BOM、来源 charset 和字节特征识别 UTF-8、UTF-16、GBK/GB18030，并保留手动切换。文件大小由宿主 resourcePolicy 限制。

仅使用 marked 解析 Markdown；highlight.js 核心和语言在可见代码块需要时加载，不包含公式、Mermaid 或编辑器。

大纲按钮保留在主工具栏，编码、阅读/原文切换和查找位于更多操作菜单。原文视图默认隐藏行号。

常用 HTML 标签、合并表格、链接、图片、标题和 details 折叠内容通过受控节点呈现；只保留局部排版属性，代码中的 HTML 按原文显示。HTML 渲染模块仅在包含真实 HTML 的阅读文档中加载，图片和链接复用现有资源解析与懒加载。
