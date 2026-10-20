# Fivo

跨框架、按需加载的 Office、文本、图片和 PDF 文件预览组件。当前工作区预览版本尚未发布，不兼容旧包入口。

公开包：@fivo/core、@fivo/dom、@fivo/office、@fivo/text、@fivo/json、@fivo/markdown、@fivo/image、@fivo/pdf、@fivo/csv、@fivo/xml、@fivo/code、@fivo/react、@fivo/vue、@fivo/vue2、@fivo/viewer。格式视图使用原生 DOM，Vue/原生宿主不安装 React。普通接入按需加载样式。

## 开发

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm docs:dev
pnpm smoke
```

### 独立框架示例

以下命令共用现有示例服务，选择一个启动即可：

```sh
pnpm demo:js     # 原生 JavaScript
pnpm demo:react  # React
pnpm demo:vue3   # Vue 3
pnpm demo:vue2   # Vue 2
```

`pnpm demo` 仍默认启动原生 JavaScript 示例。默认地址为 `http://127.0.0.1:4173/`；同时启动多个示例时，可指定不同端口，例如 `pnpm demo:vue3 --port 4174`。

示例使用已构建的组件包，不自动构建或监听源码变化。首次启动或修改 `packages/*/src` 后，先运行 `pnpm build`；如果示例服务正在运行，还需重启该服务。

- [接入指南](apps/docs/docs/guides/preview-integration.md)
- [API 文档](apps/docs/docs/docs.zh-CN.md)
- [回归与本地样本](apps/docs/docs/guides/testing.md)
- [迁移说明](apps/docs/docs/guides/migration-from-office-file-viewer.md)

apps/docs 为私有文档与烟测应用；packages 为十五个公开组件包。examples 为独立宿主示例。真实样本存放在被忽略的 tests/fixtures/local，不进入公开站点。

当前源码提供 Office、Text、JSON（含 JSONC/JSONL/NDJSON）、Markdown、CSV/TSV、XML、Code、图片和 PDF 只读预览，不包含编辑保存。新增格式须完成实际宿主验证；PDF 的 Worker 与辅助资产部署参见 [图片与 PDF 指南](apps/docs/docs/guides/image-pdf.md)。

`pnpm smoke` 的根入口直接进入 `/dev/smoke-test` 工作台；`pnpm docs:dev` 仍进入文档首页。烟测工作台提供按格式分组的样本侧栏、参数重置、Office/DOM 外壳切换与事件日志，真实样本只从本机开发接口读取。

本地文档默认从 `/` 访问，烟测入口为 `/dev/smoke-test`。部署子目录只需设置 `FIVO_DOCS_BASE` 后重新构建，配置方式见回归与本地样本指南。
