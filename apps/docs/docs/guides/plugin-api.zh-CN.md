---
title: 格式插件参数
description: 格式插件参数
keywords:
  - Filumo
  - API
siteLayout: docs
toc: content
---

# 格式插件参数

工厂配置属于创建策略。变更这些策略时应重建插件数组与查看器；viewer.update 仅更新视图参数。以下按各格式公开工厂类型列出参数。

Worker 策略按格式区分；Code 的高亮依赖 Worker，关闭时仍保留可读原文。资源预算限制当前实例拥有的工作量，不代表整个浏览器进程的内存上限。

## office · @filumo/office

| 字段                  | 类型                                                                                                                                                                        | 默认值/行为                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `fonts`               | `OfficeFontOptions`                                                                                                                                                         | 可选；字体别名、回退族与合法字体来源                           |
| `media`               | `false \| OfficeMediaOptions`                                                                                                                                               | 可选；外部媒体默认禁止，可设置 false                           |
| `onWarning`           | `(warning: OfficeWarning) => void`                                                                                                                                          | 可选；OfficeWarning 降级提示                                   |
| `onHyperlinkActivate` | `(event: OfficeHyperlinkActivateEvent) => void`                                                                                                                             | OfficeHyperlinkActivateEvent；可用 preventDefault() 接管导航。 |
| `worker`              | `'auto' \| 'always' \| 'never'`                                                                                                                                             | auto；Code 无 Worker 时保留原文而不在主线程着色                |
| `workerFactory`       | `() => Worker`                                                                                                                                                              | 未指定；使用包内 ESM Worker                                    |
| `resourcePolicy`      | `{ maxFileBytes?: number; timeoutMs?: number; maxArchiveEntries?: number; maxArchiveEntryBytes?: number; maxArchiveInflatedBytes?: number; maxCompressionRatio?: number; }` | 可选；Office 压缩包与解析预算，区别于通用读取策略              |

[本包 README 与公开类型](https://github.com/gyxing/filumo-viewer/tree/master/packages/office#readme)

## image · @filumo/image

| 字段               | 类型     | 默认值/行为                                        |
| ------------------ | -------- | -------------------------------------------------- |
| `maxDecodedPixels` | `number` | 未设置；取得自然尺寸后限制像素数，不能替代读取上限 |

[本包 README 与公开类型](https://github.com/gyxing/filumo-viewer/tree/master/packages/image#readme)

## pdf · @filumo/pdf

| 字段                  | 类型                    | 默认值/行为                                 |
| --------------------- | ----------------------- | ------------------------------------------- |
| `workerFactory`       | `() => Worker`          | 未指定；使用包内 ESM Worker                 |
| `workerSrc`           | `string`                | 未设置；使用包内适配入口                    |
| `assetsBaseUrl`       | `string`                | 未设置；包内集成资源                        |
| `cMapUrl`             | `string`                | 包内压缩 CMap；可覆盖目录                   |
| `standardFontDataUrl` | `string`                | 包内标准字体；可覆盖目录                    |
| `wasmUrl`             | `string`                | 包内 WASM 与 JS 回退；可覆盖目录            |
| `iccUrl`              | `string`                | 包内 ICC；可覆盖目录                        |
| `useWasm`             | `boolean`               | true                                        |
| `renderConcurrency`   | `number`                | 2 个页面任务                                |
| `maxDpr`              | `number`                | 2                                           |
| `maxCanvasPixels`     | `number`                | 8388608 像素/画布                           |
| `canvasCacheBytes`    | `number`                | 96 MiB                                      |
| `textCacheBytes`      | `number`                | 16 MiB，估算值                              |
| `maxSearchMatches`    | `number`                | 10000 条                                    |
| `onHyperlinkActivate` | `(url: string) => void` | 参数为 URL 字符串，不是 Office 的事务对象。 |

[本包 README 与公开类型](https://github.com/gyxing/filumo-viewer/tree/master/packages/pdf#readme)

## text · @filumo/text

| 字段            | 类型                            | 默认值/行为                                     |
| --------------- | ------------------------------- | ----------------------------------------------- |
| `encoding`      | `TextEncoding`                  | auto：BOM、来源声明与内容识别                   |
| `fallback`      | `boolean`                       | true；仅对可读未知内容兜底                      |
| `lineNumbers`   | `boolean`                       | true；显示真实行号                              |
| `wrap`          | `boolean`                       | true                                            |
| `extensions`    | `readonly string[]`             | 默认后缀与自定义列表合并                        |
| `worker`        | `'auto' \| 'always' \| 'never'` | auto；Code 无 Worker 时保留原文而不在主线程着色 |
| `workerFactory` | `() => Worker`                  | 未指定；使用包内 ESM Worker                     |

[本包 README 与公开类型](https://github.com/gyxing/filumo-viewer/tree/master/packages/text#readme)

## json · @filumo/json

| 字段                 | 类型                                     | 默认值/行为                                     |
| -------------------- | ---------------------------------------- | ----------------------------------------------- |
| `variant`            | `'auto' \| 'json' \| 'jsonc' \| 'lines'` | auto；json/jsonc/lines 可显式选择               |
| `maxRecords`         | `number`                                 | 1000000 条                                      |
| `maxCachedRecords`   | `number`                                 | 3 条                                            |
| `maxCachedNodes`     | `number`                                 | 200000 个节点                                   |
| `encoding`           | `TextEncoding`                           | auto：BOM、来源声明与内容识别                   |
| `initialMode`        | `'tree' \| 'source'`                     | tree                                            |
| `initialExpandDepth` | `number`                                 | 2 层                                            |
| `maxDepth`           | `number`                                 | 256 层                                          |
| `maxNodes`           | `number`                                 | 200000 个节点                                   |
| `worker`             | `'auto' \| 'always' \| 'never'`          | auto；Code 无 Worker 时保留原文而不在主线程着色 |
| `workerFactory`      | `() => Worker`                           | 未指定；使用包内 ESM Worker                     |

[本包 README 与公开类型](https://github.com/gyxing/filumo-viewer/tree/master/packages/json#readme)

## markdown · @filumo/markdown

| 字段                | 类型                                                                                                                          | 默认值/行为                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `encoding`          | `TextEncoding`                                                                                                                | auto：BOM、来源声明与内容识别                       |
| `initialMode`       | `'reading' \| 'source'`                                                                                                       | reading                                             |
| `outline`           | `boolean`                                                                                                                     | true                                                |
| `highlight`         | `boolean`                                                                                                                     | true                                                |
| `maxHighlightChars` | `number`                                                                                                                      | 65536 UTF-16 code units                             |
| `baseUrl`           | `string`                                                                                                                      | 未设置；远端来源 URL 可作基址，本机文件需显式配置   |
| `resolveResource`   | `( reference: string, kind: 'image' \| 'link', signal: AbortSignal, ) => string \| undefined \| Promise<string \| undefined>` | 可选；返回 undefined 会阻止该资源，不自动退回原引用 |
| `worker`            | `'auto' \| 'always' \| 'never'`                                                                                               | auto；Code 无 Worker 时保留原文而不在主线程着色     |
| `workerFactory`     | `() => Worker`                                                                                                                | 未指定；使用包内 ESM Worker                         |

[本包 README 与公开类型](https://github.com/gyxing/filumo-viewer/tree/master/packages/markdown#readme)

## csv · @filumo/csv

| 字段                 | 类型                            | 默认值/行为                                     |
| -------------------- | ------------------------------- | ----------------------------------------------- |
| `encoding`           | `TextEncoding`                  | auto：BOM、来源声明与内容识别                   |
| `worker`             | `'auto' \| 'always' \| 'never'` | auto；Code 无 Worker 时保留原文而不在主线程着色 |
| `workerFactory`      | `() => TaskWorker`              | 未指定；使用包内 ESM Worker                     |
| `delimiter`          | `CsvDelimiter`                  | auto；TSV 默认 Tab                              |
| `header`             | `boolean`                       | true；首行作为表头                              |
| `initialMode`        | `'table' \| 'source'`           | table                                           |
| `maxRows`            | `number`                        | 1000000 行                                      |
| `maxColumns`         | `number`                        | 4096 列                                         |
| `maxCachedCells`     | `number`                        | 20000 个单元格                                  |
| `cellCacheBytes`     | `number`                        | 4 MiB；估算缓存预算                             |
| `maxCellDetailChars` | `number`                        | 65536 个 UTF-16 代码单元                        |

[本包 README 与公开类型](https://github.com/gyxing/filumo-viewer/tree/master/packages/csv#readme)

## xml · @filumo/xml

| 字段            | 类型                            | 默认值/行为                                     |
| --------------- | ------------------------------- | ----------------------------------------------- |
| `encoding`      | `TextEncoding`                  | auto：BOM、来源声明与内容识别                   |
| `worker`        | `'auto' \| 'always' \| 'never'` | auto；Code 无 Worker 时保留原文而不在主线程着色 |
| `workerFactory` | `() => TaskWorker`              | 未指定；使用包内 ESM Worker                     |
| `initialMode`   | `'tree' \| 'source'`            | tree                                            |
| `maxDepth`      | `number`                        | 256 层                                          |
| `maxNodes`      | `number`                        | 200000 个节点                                   |

[本包 README 与公开类型](https://github.com/gyxing/filumo-viewer/tree/master/packages/xml#readme)

## code · @filumo/code

`html` 配置 HTML/HTM 阅读：initialMode 默认 source，baseUrl/resolveResource 显式解析图片。首次进入阅读才加载，最多处理 2 Mi 字符，失败保留源码。

| 字段                 | 类型                            | 默认值/行为                                     |
| -------------------- | ------------------------------- | ----------------------------------------------- |
| `html` | `CodeOptions['html']` | initialMode 默认 source；baseUrl/resolveResource 显式解析 HTML 资源 |
| `encoding`           | `TextEncoding`                  | auto：BOM、来源声明与内容识别                   |
| `worker`             | `'auto' \| 'always' \| 'never'` | auto；Code 无 Worker 时保留原文而不在主线程着色 |
| `workerFactory`      | `() => TaskWorker`              | 未指定；使用包内 ESM Worker                     |
| `language`           | `CodeLanguage \| 'auto'`        | auto；按文件身份选择，可手动指定 CodeLanguage   |
| `maxHighlightChars`  | `number`                        | 262144 UTF-16 code units                        |
| `maxHighlightRanges` | `number`                        | 100000 个装饰区间                               |
| `highlightTimeout`   | `number`                        | 5000 ms                                         |

[本包 README 与公开类型](https://github.com/gyxing/filumo-viewer/tree/master/packages/code#readme)

CodeLanguage 可选值：`javascript`, `typescript`, `html`, `css`, `less`, `scss`, `sass`, `bash`, `python`, `sql`, `java`, `c`, `cpp`, `csharp`, `go`, `rust`, `yaml`, `toml`, `powershell`, `batch`, `php`, `ruby`, `kotlin`, `swift`, `lua`, `dockerfile`, `makefile`, `cmake`, `graphql`, `protobuf`, `diff`, `dotenv`, `plaintext`.

CsvDelimiter 可选 auto、逗号、分号、Tab（\t）或竖线；初始分隔符还会结合文件后缀。

## 编码与单位

TextEncoding 为 auto、utf-8、utf-16le、utf-16be、gbk 或 gb18030。字节预算按字节，超时按毫秒，源码长度预算按 UTF-16 代码单元计数。Worker 与 Markdown 资源示例见[生产部署](./deployment)，格式限制仍以[兼容范围](./compatibility)为准。

## archive · @filumo/archive

| 配置             | 默认值          | 用途                                               |
| ---------------- | --------------- | -------------------------------------------------- |
| `resourcePolicy` | 见下方预算      | 条目数、单文件、累计输出、嵌套、缓存和完整输入上限 |
| `workerFactory`  | 包内模块 Worker | 覆盖 Worker 创建                                   |
| `assetsBaseUrl`  | 包内 WASM       | 同版本资源根目录覆盖                               |

默认：maxEntries 20,000；maxEntryBytes 128 MiB；maxTotalUncompressedBytes 512 MiB；maxNestedDepth 2（根为 0）；cacheBytes 64 MiB；maxWasmInputBytes 64 MiB；maxFullReadBytes 128 MiB。目录浏览和子预览分开限额。ZIP/TAR 复用有效区间，GZIP 顺序扫描，WASM 限制完整输入。首版不含加密/分卷；跨文件链接默认阻止，相邻唯一图片使用子预览租约。
