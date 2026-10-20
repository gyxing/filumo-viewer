# @fivo/text

框架无关的只读预览插件，配合 @fivo/dom 或已有框架适配器使用。

```ts
import { text } from '@fivo/text';
const plugins = [text()];
```

工厂只注册格式描述符，驱动、视图、Worker、样式按需加载。自动编码结合 BOM、来源 charset 和字节特征识别 UTF-8、UTF-16、GBK/GB18030，并保留手动切换。文件大小由宿主 resourcePolicy 限制。

`@fivo/text/reader` 提供无 DOM 的读取和索引，`@fivo/text/view` 提供独立加载的原文视图。

编码、查找、自动换行和行号位于更多操作菜单。行号默认显示，可通过菜单或 `lineNumbers: false` 关闭；默认只显示真实行号，不向空白区延伸数字，自动换行默认开启。

默认启用未知格式的文本兜底：所有已注册插件均未匹配时，先排除常见二进制文件头，再探测文本编码。完整读取与可读性校验通过后，使用原文视图展示，并保留原文件名与字节；HTML 等标签只作为文字显示。无法确认可读时显示暂不支持，不引导用户对未知二进制反复尝试编码。专用插件已经匹配后的解析错误不触发文本兜底。

`text({ fallback: false })` 可关闭自动兜底。常规匹配仅接管明确的文本扩展名（包含 `extensions` 配置），无后缀、未知后缀或仅有 `text/plain` 声明的文件需要通过兜底校验。宿主仍可使用 `viewer.open(input, { pluginId: 'text' })` 显式选择原文预览，保留原有手动编码恢复行为。

兜底探测最多检查 64 KiB 前缀，并遵守宿主配额；来源不支持区间读取时可能完整读取，最终预览复用来源缓存。探测模块动态加载，不在注册阶段创建 Worker 或加载视图。自动兜底首次解码始终使用自动模式，不受 `encoding` 手动默认值绕过，预览后可以在菜单中切换编码。

公共解码和索引能力已移到 @fivo/core/text，公共原文视图移到 @fivo/dom/text；旧 reader/view 子入口保留兼容导出。新格式应直接依赖公共层。external 模式加载 DOM 与 Text 两个 styles.css。
