# @filumo/office

## 0.1.1

### Patch Changes

- f77cd60: React 适配层透传原件下载接管，DOM 增加统一工具栏显隐配置及宿主操作扩展。Archive 新增 ZIP 专用公开入口与 Worker，复用既有归档界面和预算，支持宿主只打包所需压缩格式。

  工具栏采用单行优先展开策略，超出时按组进入更多，外壳与格式操作统一收纳。PDF 缩略图、Office 与 CSV 的适用操作优先展示，空大纲及未修改列宽的恢复入口隐藏。

  Excel 和 CSV 初始保持空选区，支持 Esc 与阅读空白清除，滚动重绘保存空状态，复制能力跟随有效选区。

  PDF 初始侧栏收起，有大纲时自动展开，无大纲和读取失败保持收起，异步结果保留用户手动选择。

  新增声明式 zoomMode 和 fitMaxZoom，PDF、Office 及 CSV 支持自动宽度与固定比例，自动上限独立于手动缩放，CSV 增加整表宽度测量与尺寸观察。

- Updated dependencies [cf2cd37]
- Updated dependencies [f77cd60]
- Updated dependencies [f77cd60]
- Updated dependencies [f77cd60]
  - @filumo/core@0.1.1
  - @filumo/dom@0.1.1
  - @filumo/image@0.1.1
