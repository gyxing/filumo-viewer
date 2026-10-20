# @fivo/xml

独立只读格式插件，使用公共 Core/text 解码与 DOM 外壳，格式实现按需加载。

```ts
import { xml } from '@fivo/xml';
const plugins = [xml()];
```

Worker 可选 auto/always/never 或自定义 workerFactory；需部署 worker.js 与 worker-chunks。external 样式模式加载 @fivo/dom/styles.css 及本包 styles.css。功能、默认预算与限制见项目文本格式指南。

左侧原文默认显示真实行号，可通过更多菜单中的行号开关关闭或恢复，开关带图标和选中状态。当前文件内切换视图、缩放或重新解码会保留选择；默认不在末行后的空白区延伸数字。

右侧结构将元素名、属性名、属性值、文本、CDATA 与辅助标点分段显示，采用与 JSON 一致的结构语义色；选中背景保留值颜色。没有 Schema 类型信息时，所有属性值和正文均按字符串展示，数字或布尔外观不会转换类型。XML 内容只作为文本节点插入，长值省略后仍可点击定位完整原文。
