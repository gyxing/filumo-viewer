---
title: 迁移到 Filumo
description: 迁移到 Filumo 0.1.0 的包作用域、API、样式、Worker、生命周期与部署路径。
keywords:
  - Filumo
  - file preview
  - document viewer
  - 文件预览
siteLayout: docs
toc: content
---

# 迁移到 Filumo

Filumo 使用新的包名与公开接口，**不兼容旧入口**。迁移目标是跨框架、按需加载和自动样式，不是在新包中继续保留旧 API。

## 选择新的包

| 原使用方式                   | 新接入                                                       |
| ---------------------------- | ------------------------------------------------------------ |
| React OfficeFileViewer       | @filumo/react 的 DocumentViewer + @filumo/office 的 office() |
| 旧 layout 子路径             | @filumo/dom 的 createViewer 和能力接口                       |
| Vue 包装 React 组件          | @filumo/vue 或 @filumo/vue2，直接复用原生 Office             |
| 内部解析函数或 dist 深层路径 | Core 公开协议；不要依赖内部格式模型                          |

标准场景可使用 @filumo/viewer 的 standardPlugins。该包是插件预设，不是同时包含所有框架的组件入口。

## 参数映射

| 旧概念                          | 当前方式                                          | 注意                                |
| ------------------------------- | ------------------------------------------------- | ----------------------------------- |
| uri                             | source / viewer.open(input)                       | 输入类型按 DocumentInput 重新适配   |
| parseOptions                    | office({ worker, workerFactory, resourcePolicy }) | 格式选项属于插件                    |
| theme.mode                      | options.theme                                     | 当前支持 light / dark               |
| height                          | options.height                                    | 默认 560px；百分比依赖父容器        |
| locale                          | options.locale                                    | zh-CN / en-US                       |
| defaultViewState.zoom           | options.zoom                                      | 也可通过 capabilities.zoom.set 调整 |
| 工具栏自定义回调                | toolbar: false + 能力订阅                         | 宿主负责自己的 UI                   |
| onPreviewReady / onFileParsed   | onReady + 状态/会话订阅                           | 时序语义不同，不逐字段机械改名      |
| onWarning / onHyperlinkActivate | office(options) 内的回调                          | 不是 DocumentViewer 顶层 props      |

旧版异步来源返回 Response 的写法需要改为 Blob、Uint8Array、URL 描述对象，或返回 DocumentSource 的来源工厂。

## React 示例

```tsx | pure
import { DocumentViewer } from '@filumo/react';
import { office } from '@filumo/office';
const plugins = [office({ worker: 'auto' })];
export function Preview({ file }: { file?: File }) {
  return (
    <DocumentViewer
      source={file}
      plugins={plugins}
      options={{ height: 640, theme: 'light' }}
    />
  );
}
```

plugins 保持稳定。不要每次渲染创建数组，也不要同时传 source 和对同一文件调用 ref.open。

## 样式与 Worker

删除旧包样式导入和旧 Less 处理配置（若仅为旧包添加）。普通 Filumo 接入由组件自动加载样式，不需要补 import CSS。

严格 CSP 通过 stylePolicy.nonce 或显式 external 模式配置；外部模式需要匹配版本的 @filumo/dom/styles.css 、@filumo/image/styles.css 与 @filumo/office/styles.css。Worker 改用当前包的资源 URL 或 workerFactory，不复用旧包输出文件名。

## 生命周期和交互

React/Vue 由适配器管理卸载，原生宿主调用 destroy。Vue KeepAlive 暂停呈现并保留会话。destroy 后要创建新实例；setActive(false) 只暂停。

查看器能力可能随文档变化而缺省，不能预设所有格式都有上一页、下一页。用 actions 的 ID 与 options 驱动表格工作表、Word 修订和 PPT 备注。

## 不恢复的内容

旧 uri/parseOptions/defaultViewState API、React 绑定的 Office 内核、旧入口别名、旧 dist 路径和未文档化内部模型均不恢复。当前仍只有只读预览；不存在编辑后保存 API。

迁移完成后，验证目标框架的生产打包、文件来源、Worker、图片弹层、搜索、资源清理和部署子目录。不要只用类型通过或静态首页检查作为迁移完成依据。

## 作用域与版本统一

所有公共包使用 `@filumo/*` 和 `0.1.0`；样式前缀为 `filumo-`，公共错误名称为 `FilumoError`，项目环境变量使用 `FILUMO_*`。自定义工具栏、CSP 配置和部署脚本中的旧标识需要同步迁移。不要手动修改 generated/package.ts 或复制旧构建缓存。

当前仓库与 Pages 地址仍保留 office-file-viewer 路径，这不是旧包 API。GitHub Pages 前缀继续使用 /office-file-viewer/；产品改名不代表仓库地址已迁移。完整包清单见[包总览](./packages)。
