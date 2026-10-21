---
title: Filumo 本地开发与测试
description: Filumo 文档与烟测的源码热更新、构建产物验证、部署子目录和 GitHub Pages 发布流程。
keywords:
  - Filumo
  - file preview
  - document viewer
  - 文件预览
siteLayout: docs
toc: content
---

# 本地开发与测试

本页区分公开文档、私有烟测、独立宿主和自动回归。测试脚本通过不等于全部视觉场景一致，应按实际改动选择验证范围。

## 环境与首次启动

仓库使用 Node.js 22 与 package.json 固定的 pnpm 11.10.0。不要改用 npm/Yarn 安装仓库依赖，也不要手工修改锁文件。

```sh
pnpm install --frozen-lockfile
pnpm build
```

## 日常命令

| 命令            | 场景         | 说明                               |
| --------------- | ------------ | ---------------------------------- |
| pnpm docs:dev   | 文档站开发   | /、/playground、/docs 及对应中文页 |
| pnpm smoke      | 本机文档烟测 | 默认进入 /dev/smoke-test 工作台    |
| pnpm demo:js    | 原生 JS 示例 | 构建产物，无 React                 |
| pnpm demo:react | React 示例   | 真实 @filumo/react 接入            |
| pnpm demo:vue3  | Vue 3 示例   | 原生 Office 与 KeepAlive           |
| pnpm demo:vue2  | Vue 2 示例   | Options API 接入                   |
| pnpm docs:build | 文档生产构建 | 输出 apps/docs/dist，不发布站点    |

pnpm demo 默认等同原生 JS 示例。默认端口 4173；并行启动时设置不同端口，例如 pnpm demo:vue3 --port 4174。

## 热更新边界

docs:dev 和 smoke 直接编译工作区 packages 源码。启动时准备包元数据、公开样本和 PDF 静态资源，不先构建所有组件包。普通页面由 dumi 热更新；包视图、样式或 Worker 变化由开发插件触发页面刷新并释放旧会话。新增入口、依赖或构建配置变化仍可能需要重启。独立 demo 消费构建产物，修改包源码后需重新构建并重启 demo。

Playground 用于公开体验和接入代码展示；其中框架标签切换代码示例，不切换已经挂载的页面框架。分别验证框架行为应使用独立 demo。

烟测工作台覆盖 Office 及新增格式，提供样本筛选、本机文件选择、格式参数和事件日志。仅开发 smoke 模式注册本机端点；公开 Playground 使用公共插件，不访问本机样本目录。

## 自动检查

| 命令                                | 覆盖                               |
| ----------------------------------- | ---------------------------------- |
| pnpm check:types                    | 包与文档应用的类型检查             |
| pnpm check:lint / pnpm check:styles | TypeScript/JSX 与 Less 规则        |
| pnpm test                           | 现有单元与合同测试                 |
| pnpm test:consumers                 | 打包、独立安装、真实宿主消费       |
| pnpm test:browser                   | 公开样本和浏览器回归               |
| pnpm test:browser:local             | 本机样本回归，报告与公开测试分离   |
| pnpm test:acceptance                | 检查升级验收证据；并非替代真实运行 |

安装浏览器与运行文档定向回归：

```sh
pnpm exec playwright install chromium
pnpm docs:build
pnpm test:browser docs.spec.mjs
```

已有 Edge 可通过 FILUMO_BROWSER_CHANNEL=msedge 选择。CI 的 Linux 浏览器安装使用 --with-deps。只执行部分用例时报告必须明确范围，不能声称全量通过。

## 样本与隐私

公开样本覆盖生成的 Office、图片、PDF、文本与结构化格式，不含业务数据。本机文件位于被忽略的 tests/fixtures/local，仅本机烟测端点可读。公开生产构建不注册烟测路由，也不发布这些文件。

真实文档的截图、日志与测试输出必须留在本地专用目录，不能上传公开 CI 附件。浏览器只打开本机文件并不意味着截图不包含隐私。

## 路由和部署子目录

默认根路径为 /。英文文档 /docs，中文 /zh-CN/docs，指南在各自 docs/guides 下。Playground 为 /playground 和 /zh-CN/playground。烟测仅开发模式可用。

```powershell
# 只改变当前终端，不修改系统设置。
$env:FILUMO_DOCS_BASE = '/preview/'
pnpm docs:build
pnpm test:browser docs.spec.mjs
Remove-Item Env:FILUMO_DOCS_BASE
```

构建、测试服务与浏览器用例必须使用同一 FILUMO_DOCS_BASE。修改部署前缀要重新构建；路径不是简单给浏览器 URL 加前缀。GitHub Pages 实际目录由工作流设置，本地不需要旧包名路由。

## GitHub Pages 发布链路

现有公开站点为 https://gyxing.github.io/office-file-viewer/，FILUMO_DOCS_BASE 使用 /office-file-viewer/。产品名为 Filumo，仓库名和部署目录尚未迁移。

.github/workflows/deploy-pages.yml 监听 master 分支 push，并保留 workflow_dispatch 手动入口。当前 next 分支的本地修改不会自动更新公开站点。工作流按锁文件安装依赖，执行 pnpm run docs:build，上传 apps/docs/dist 后部署。手动运行使用所选 ref 的内容，执行前应明确目标版本。

只更新本地源码不会发布；生产构建也不会自动部署。需要发布时再明确授权 Git 提交、推送或工作流运行。站点构建入口会准备同版 PDF 包内资源并排除本机烟测路由，不使用 public 目录复制作为默认加载兜底。

## 构建维护入口

- esbuild 负责组件包，dumi 负责文档应用；当前没有 Father 或第二套组件编译命令。
- 版本来自各包 package.json；DOM/Office generated/package.ts 由脚本生成，不手工维护。
- Less 编译为按需自动样式，external CSS 使用稳定顺序；样式作用域取所属包版本。
- Office 公开声明从 types 入口生成，完整源码仍执行类型检查。
- `pnpm build <包名>` 会自动补齐 workspace 前置包；`pnpm test:consumers` 验证其目标包组合，`pnpm test:consumers:hosts` 验证 npm/Yarn 宿主。
- Worker 单独输出为公开 worker.js；构建清单由 metafile 记录，不硬编码哈希 chunk 名称。
- 只有用户明确要求才执行发布、Git 提交或推送。

## 视觉回归建议

文档页检查品牌导航、目录、正文宽度、表格、代码块、语言切换和锚点。Playground 检查参数与代码同步、重置、复制、文件选择及窄屏布局。

组件 UI 验证应打开默认工具栏，覆盖图片弹层、主题和跨框架构建产物。源码测试与真实发布产物的样式作用域不同，不能只验证前者。
