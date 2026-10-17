# @fivo/text

框架无关的只读预览插件，配合 @fivo/dom 或已有框架适配器使用。

```ts
import { text } from '@fivo/text';
const plugins = [text()];
```

工厂只注册格式描述符，驱动、视图、Worker、样式按需加载。自动编码结合 BOM、来源 charset 和字节特征识别 UTF-8、UTF-16、GBK/GB18030，并保留手动切换。文件大小由宿主 resourcePolicy 限制。

`@fivo/text/reader` 提供无 DOM 的读取和索引，`@fivo/text/view` 提供独立加载的原文视图。

编码、查找、自动换行和行号位于更多操作菜单。行号默认隐藏，可通过菜单或 `lineNumbers: true` 开启；自动换行默认开启。
