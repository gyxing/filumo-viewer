# @filumo/viewer

## 0.1.1

### Minor Changes

- 统一包新增 DOM、React、Vue 3、Vue 2 及各格式独立子入口，内部模块与 Worker、样式和资源自包含。宿主只需声明一个 Filumo 依赖，通过静态子入口选择格式，格式引擎继续按文件类型异步加载。框架运行时通过可选 peer 依赖使用宿主实例。

- cf2cd37: 增加可取消来源流、单次打开资源上下文、子查看器与原文件下载接管；Code 提供按需 HTML 阅读，Markdown 复用受控 HTML 公共能力。标准预设接入首版 Archive，支持按格式分工的目录浏览与包内预览，WASM 后端有界读取。Archive 初始化版本为 0.1.0，不在此记录中额外升版。

  归档预览使用单一顶部工具栏，返回上级和文件名搜索固定在左侧目录上方；子文件能力通过订阅转交，下载菜单区分当前子文件和最外层原压缩包，沿用宿主下载接管与大小限制。

### Patch Changes

- Updated dependencies [cf2cd37]
- Updated dependencies [f77cd60]
- Updated dependencies [f77cd60]
  - @filumo/code@0.1.1
  - @filumo/markdown@0.1.1
  - @filumo/archive@0.1.1
  - @filumo/pdf@0.1.1
  - @filumo/office@0.1.1
  - @filumo/csv@0.1.1
  - @filumo/image@0.1.1
  - @filumo/json@0.1.1
  - @filumo/text@0.1.1
  - @filumo/xml@0.1.1
