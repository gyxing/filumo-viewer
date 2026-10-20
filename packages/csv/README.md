# @fivo/csv

独立只读格式插件，使用公共 Core/text 解码与 DOM 外壳，格式实现按需加载。

```ts
import { csv } from '@fivo/csv';
const plugins = [csv()];
```

Worker 可选 auto/always/never 或自定义 workerFactory；需部署 worker.js 与 worker-chunks。external 样式模式加载 @fivo/dom/styles.css 及本包 styles.css。功能、默认预算与限制见项目文本格式指南。
