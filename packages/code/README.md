# @fivo/code

独立只读格式插件，使用公共 Core/text 解码与 DOM 外壳，格式实现按需加载。

```ts
import { code } from '@fivo/code';
const plugins = [code()];
```

支持常用代码语言及 CSS、LESS、SCSS、Sass 样式源码。默认显示行号并启用自动换行，可通过更多菜单关闭行号。LESS/SCSS 使用现有 highlight.js 语法，Sass 使用包内轻量缩进语法规则，均按需加载；样式源码只作文本预览，不编译或应用到页面。

Worker 可选 auto/always/never 或自定义 workerFactory；需部署 worker.js 与 worker-chunks。external 样式模式加载 @fivo/dom/styles.css 及本包 styles.css。功能、默认预算与限制见项目文本格式指南。

常用扩展均归属本包：YAML/YML、TOML、PowerShell（PS1/PSM1/PSD1）、Batch/CMD、PHP、Ruby/Rake、Kotlin/KTS、Swift、Lua、GraphQL/GQL、Proto、Diff/Patch，以及 Dockerfile、Makefile、CMake 和 .env 文件。语言菜单使用分隔线按类别整理，纯文本位于末项。

完整文件名优先于通用后缀：识别 `Dockerfile`、`Dockerfile.*`、`*.dockerfile`、`Makefile`、`GNUmakefile`、`*.mk`、`CMakeLists.txt`、`*.cmake`、`.env` 和 `.env.*`。专用文档后缀仍由对应插件处理，如 `.env.json` 继续交给 JSON。普通 INI/CONF/CFG/Properties 留在 Text；明确构建/环境文件名由 Code 处理，未注册 Code 时可使用 Text 内容兜底或显式选择 Text。

TOML 复用现有 INI 语法模块；Dockerfile 加载 Shell，YAML 加载上游要求的 Ruby 语法。PHP 同时覆盖裸代码和带标签的 HTML 模板；.env 使用包内轻量规则，变量只着色，不展开或执行。所有语法均在高亮任务中动态加载，不新增第三方库或格式包。Vue/Svelte 混合语法适配另行实施。
