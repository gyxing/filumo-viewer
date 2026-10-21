---
title: 文本、结构化文件与代码
description: Filumo 的文本编码、JSON/JSONC/JSONL、Markdown、CSV/TSV、XML 和代码预览能力、默认值及限制。
keywords:
  - Filumo
  - file preview
  - document viewer
  - 文件预览
siteLayout: docs
toc: content
---

# 文本、结构化文件与代码

六个独立插件共用 Core 的文本处理与 DOM 视图，不需要通过 Text 包复用公共逻辑，也不需要新的框架专用组件。当前版本为 0.1.0，尚未发布；安装组合见[包总览](./packages)。

```ts | pure
import { createViewer } from '@filumo/dom';
import { text, json, markdown, csv, xml, code } from '@filumo/viewer';

const viewer = createViewer(container, {
  plugins: [text(), json(), markdown(), csv(), xml(), code()],
  resourcePolicy: { maxFileBytes: 20 * 1024 * 1024 },
});
await viewer.open(new File(['first line\nsecond line'], 'sample.txt'));
// 宿主卸载时调用，释放当前会话与视图。
async function disposePreview() {
  await viewer.destroy();
}
```

普通字符串表示 URL；直接文本应使用 File、Blob 或 DocumentSource。下载保存原始文件字节，视图切换不改写文件。上例 20 MiB 是宿主自行选择的限制，不是格式包的统一默认上限。

## 编码识别与切换

公共解码按手动选择、BOM、来源 MIME charset、格式提示、内容推断的优先级处理。自动识别结合 UTF-16 字节特征、严格 UTF-8 与 GB18030，覆盖常见 GBK 文件；没有声明时属于内容推断，可手动纠正。XML 额外读取前 4 KiB 中的编码声明，优先级低于 BOM 与来源 charset。

更多菜单直接选中实际使用的 UTF-8、UTF-16LE、UTF-16BE、GBK 或 GB18030，并提供重新自动识别操作。切换从已有原始字节重新解码，不重复下载。手动编码不兼容时保留上一次正常内容，在右上角提示失败原因和重试方式；首次打开没有可用内容时才显示编码选择空态。

## 默认视图与工具栏

| 插件       | 初始视图                   | 原文行号         | 自动换行     |
| ---------- | -------------------------- | ---------------- | ------------ |
| Text       | 原文                       | 开启             | 开启         |
| Code       | 源码                       | 开启             | 开启         |
| JSON / XML | 结构；宽容器原文与结构各半 | 开启             | 开启         |
| Markdown   | 阅读                       | 原文默认关闭     | 开启         |
| CSV        | 表格，首行作为表头         | 原文模式默认关闭 | 原文模式开启 |

行号默认只显示真实行数。编码、视图、查找、自动换行和行号按格式收纳到更多菜单，一级操作带图标。Markdown 大纲保留在主栏；JSON 分支展开/收起合并为状态按钮。JSON/XML 原文行号可从更多菜单切换，当前文件内视图切换、缩放和重新解码保留选择。

## Text 与未知文件兜底

Text 明确接管 TXT、LOG、INI、CONF、CFG、PROPERTIES、OUT。可配置 extensions、encoding、lineNumbers、wrap 与 fallback。所有专用插件未匹配后，未知后缀或无后缀文件才通过文件头、编码特征和完整可读性检查尝试原文预览；标签保持文本，不执行 HTML。无法确认时提示暂不支持该格式。

text({ fallback: false }) 禁用兜底。首次兜底固定自动识别，不用手动默认编码绕过检查；成功后仍可切换编码。专用插件的解析错误、网络失败、超时或配额错误不会转成 Text。未注册 Text 时不隐式启用。

## JSON / JSONC / JSONL / NDJSON

JSON 严格校验；JSONC 允许注释及尾逗号，不支持 JSON5。默认结构与原文双栏各半，支持拖动分隔线，窄于 720px 时一次呈现一个区域。结构保留重复键及数字原文，不通过 JavaScript 数字转换丢失大整数。点击节点可定位原文，默认展开两层。

JSONL/NDJSON 按非空物理行独立校验，记录列表与详情分开窗口化，坏行不影响其他记录。结构错误保留原文和诊断，不伪装成 TXT。

| 预算             | 默认值    |
| ---------------- | --------- |
| maxDepth         | 256       |
| maxNodes         | 200,000   |
| maxRecords       | 1,000,000 |
| maxCachedRecords | 3         |
| maxCachedNodes   | 200,000   |

initialMode: 'source' 延迟结构扫描。超长单行超过 65,536 个 UTF-16 代码单元时跳过行着色，完整原文仍可阅读。

## Markdown

默认阅读模式，开启大纲与代码高亮。支持标题、列表、GFM 表格、任务列表、删除线、引用、代码块和原文。阅读表格铺满内容区，代码块保留横向滚动；任务列表使用独立复选框，不重复显示项目符号或原始 [ ] 标记。

常用 HTML 受控呈现，含 br、table、a、img、标题、文字格式和 details；标签、属性及局部样式受限制，脚本、事件属性、全局样式和嵌入页面不会进入阅读视图。HTML 标题及自定义锚点参与定位；代码中的标签始终保持字面内容。不含公式、Mermaid 或编辑器。

相对资源使用远端文档 URL 或显式 baseUrl；本机 File 不自动获取相邻文件。通过 resolveResource 提供受控映射。图片进入可见范围后请求，遵守协议及生命周期约束。

marked 与 highlight.js 是已有必要依赖。高亮按可见代码块和语言加载，maxHighlightChars 默认 65,536；未知语言、关闭高亮或超预算时显示普通代码。HTML 片段渲染模块只在真实 HTML token 出现时加载。

## CSV / TSV

默认首行表头；TSV 默认 Tab，CSV 自动识别逗号、分号、Tab 或竖线。支持分隔符切换、列宽拖动、矩形选区和完整 TSV 复制。所有字段均为只读字符串，不执行公式。表格按行列窗口化，解析失败可保留原文。

| 预算               | 默认值    |
| ------------------ | --------- |
| maxRows            | 1,000,000 |
| maxColumns         | 4,096     |
| maxCachedCells     | 20,000    |
| cellCacheBytes     | 4 MiB     |
| maxCellDetailChars | 65,536    |

详情截断不截断复制的原始字段。

## XML

只接管明确 XML，不接管 SVG。原文与结构默认各半，支持拖动调整。结构呈现命名空间、属性、混合文本、CDATA、注释及处理指令；空白文本默认隐藏。名称、值和辅助标记分色，属性与正文始终视为字符串，不根据外观转为数字或布尔值。

默认 initialMode: 'tree'、maxDepth: 256、maxNodes: 200000。DOCTYPE 返回诊断，不请求外部实体。单独原文模式延迟结构解析。

## Code

| 类别       | 文件范围                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------- |
| Web        | JS/JSX, TS/TSX, HTML, CSS, LESS, SCSS, Sass                                              |
| 常用语言   | Shell, Python, SQL, Java, C/C++, C#, Go, Rust, PHP, Ruby, Kotlin, Swift, Lua             |
| 配置与脚本 | YAML/YML, TOML, .env/.env.\*, PowerShell, BAT/CMD                                        |
| 构建与协议 | Dockerfile, Makefile/GNUmakefile, CMakeLists.txt, .mk/.cmake, GraphQL, Proto, Diff/Patch |

这些能力统一位于 @filumo/code。文件名、后缀和默认语言共用规则；.h 默认 C，可手动切换 C++。Vue/Svelte 混合语法适配仍为后续范围。源码只展示，不执行脚本、编译 Sass 或应用样式。明确的 JSON/XML 等后缀保持专用包归属。

高亮只在独立 Worker 中运行，按语言加载已有 highlight.js；Sass 使用包内轻量规则。默认最多 262,144 字符、100,000 装饰区间、5,000ms。关闭 Worker、超预算、不可用、失败或超时时继续显示可复制、查找的原文，不转到主线程同步高亮。

## 部署与资源预算

新集成使用 @filumo/core/text 的解码、TextContent、行索引、查找与任务协议，以及 @filumo/dom/text 的原文视图。DOM 的 text-messages、text-highlight、outline 和 split 是对应公共子入口；旧 Text/reader 与 Text/view 继续兼容导出。

external 模式加载 DOM 及实际使用格式的 styles.css，不需要为了 JSON/XML 的原文额外导入 Text 样式。Worker 手动部署需保留每个格式包的 worker.js 与 worker-chunks；Vite 使用 worker: { format: 'es' }。Code 的 Worker 策略与 Office 自动回退语义不同，不能把 Office 设置直接套用到所有格式。

查找最多保留 10,000 个匹配。窗口化控制 DOM 数量，不限制解码原文、索引及结构的总内存。使用 resourcePolicy.maxFileBytes 与格式预算控制实际输入，并针对代表性文件验证性能。
