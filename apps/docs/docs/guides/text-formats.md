---
title: Text, JSON and Markdown
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

Text 默认接管 TXT、LOG、INI、CONF、CFG、PROPERTIES、OUT，默认显示真实行号并启用自动换行；可在插件选项中配置 extensions、lineNumbers、wrap，通过 lineNumbers: false 或更多操作菜单关闭行号。

Text 默认还提供内容兜底：所有专用插件均未匹配后，未知后缀、无后缀或只有 text/plain 声明的文件会先检查文件头及编码特征，再完整解码并校验可读性。确认是文本后使用原文视图，HTML、XML 等标签保持文字，不额外执行或解析；无法确认时提示暂不支持该格式。专用插件已经接管后的解析错误、网络失败、超时和配额错误不转换成文本预览。

可通过 `text({ fallback: false })` 关闭自动兜底；未注册 Text 时不会隐式加载它。显式 `viewer.open(input, { pluginId: 'text' })` 仍可选择原文。兜底首次解码固定采用自动识别，不使用 `encoding` 的手动默认值绕过校验，成功打开后仍可切换编码。探测模块按需加载，区间读取不可用时可能读取完整来源，最终打开复用读取缓存并继续遵守 resourcePolicy。

编码、视图切换、查找、自动换行和行号按当前格式收纳到更多操作菜单。Markdown 大纲保留在主工具栏；JSON 使用同一个按钮展开或收起当前选中分支，普通值及空容器不可切换。JSON、XML 的左侧原文默认显示真实行号，可在更多菜单中切换，当前文件内缩放、视图切换和重新解码均保留选择；Markdown 的原文视图默认隐藏行号。

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

## 新增格式与公共入口

新增独立包为 `@fivo/csv`、`@fivo/xml`、`@fivo/code`，JSONC、JSONL、NDJSON 由 `@fivo/json` 处理。标准预设共九个插件，各格式之间没有反向依赖 Text 包。

CSV/TSV 默认首行表头，支持分隔符切换、列宽调整、矩形选择和完整 TSV 复制；按行列窗口化。默认最多 1,000,000 行、4,096 列，字段缓存最多 20,000 项且估算不超过 4 MiB，详情显示最多 65,536 字符，复制仍使用完整字段。解析失败保留原文。

JSONC 允许注释和尾逗号，JSON 仍严格校验，不支持 JSON5。JSONL 按非空物理行独立校验，左侧记录列表、右侧结构/原文详情，整文件原文单独显示。默认最多 1,000,000 条记录，详情 LRU 最多 3 条且合计 200,000 节点，坏行不影响其他记录。

XML 只接管明确 XML，不接管 SVG。原文和结构默认各半，可拖动调整；支持命名空间、属性、混合文本、CDATA、注释和处理指令，空白文本默认隐藏。结构限制深度 256、节点 200,000；DOCTYPE 返回诊断，不请求外部实体。编码声明仅取前 4 KiB，优先级低于 BOM 和来源 charset。 结构区的名称、值和辅助标记分色，与 JSON 共用结构主题色；选中时保留语义颜色。属性值及正文始终按字符串展示，不根据数字或布尔外观转换类型，长值可定位原文查看。

Code 支持 JS/JSX、TS/TSX、HTML/CSS、LESS/SCSS/Sass、Shell、Python、SQL、Java、C/C++、C#、Go、Rust；.h 默认 C，可手动切换 C++。默认显示行号、换行开启；行号可从更多菜单关闭，HTML 显示原文。LESS/SCSS 按需使用现有语法模块，Sass 使用包内轻量着色规则；只预览源码，不编译或应用样式。独立 Worker 才加载现有 highlight.js 与必要语法，默认 262,144 字符、100,000 装饰区间、5,000ms 超时；关闭 Worker、超预算、不可用或失败时继续显示可查找、复制的原文，不在主线程同步高亮。

新增格式查找最多保留 10,000 个结果；字节、解码原文、索引和结构可能同时占内存，宿主仍须通过 resourcePolicy 限制输入。

新代码从 `@fivo/core/text` 使用解码、行索引、查找、TextContent 和任务协议，从 `@fivo/dom/text` 按需加载原文视图。文案、高亮装饰、拖柄分别使用 DOM 的 text-messages、text-highlight、split 子入口；旧 `@fivo/text/reader` 和 `@fivo/text/view` 保留兼容导出。公共解码优先级为手动选择、BOM、来源 charset、格式提示、内容推断。

external 模式须加载 `@fivo/dom/styles.css` 和实际使用格式的 styles.css；旧 Text/view 也使用 DOM 原文样式。部署 Worker 时保留各包 worker.js 与 worker-chunks。新增包只复用已有 saxes、highlight.js，不增加第三方库种类。


## Code 的常用开发文件

这些格式统一注册在 `@fivo/code`，提供带高亮的只读源码预览，不新增格式包或第三方库：

| 类别 | 文件范围 |
| --- | --- |
| 配置 | `.yaml`、`.yml`、`.toml`、`.env`、`.env.*` |
| Windows 脚本 | `.ps1`、`.psm1`、`.psd1`、`.bat`、`.cmd` |
| 常用语言 | `.php`、`.rb`、`.rake`、`.kt`、`.kts`、`.swift`、`.lua` |
| 构建 | `Dockerfile`、`Dockerfile.*`、`*.dockerfile`、`Makefile`、`GNUmakefile`、`.mk`、`CMakeLists.txt`、`.cmake` |
| 接口定义 | `.graphql`、`.gql`、`.proto` |
| 补丁 | `.diff`、`.patch` |

文件身份按明确文件名和后缀共同识别，描述符和默认语法共用同一规则。普通 TXT、INI、CONF、CFG、Properties 继续由 Text 处理；CMakeLists.txt 等明确构建/环境文件名为 Code 留出常规识别机会。未注册 Code 时可使用 Text 的内容兜底，或显式选择 Text。专用格式后缀保持原归属，例如 `.env.json` 由 JSON 处理、`Dockerfile.xml` 由 XML 处理。

语言菜单沿用纯菜单交互，用分隔线按类别整理；默认行号开启、换行开启。TOML 复用现有 INI 语法，Dockerfile 加载 Shell，YAML 加载上游声明需要的 Ruby；PHP 同时支持裸代码与带标签的 HTML 模板。`.env` 的变量引用和命令片段只展示，不展开或执行。Diff 的新增和删除使用明暗主题下的不同颜色。

公共样本保留原始基本文件名，烟测不会把 `Makefile`、`CMakeLists.txt`、`.env.production` 重新拼成其他文件名。Vue/Svelte 的混合语法适配仍属后续增强范围。
