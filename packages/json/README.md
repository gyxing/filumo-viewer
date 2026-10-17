# @fivo/json

框架无关的只读预览插件，配合 @fivo/dom 或已有框架适配器使用。

```ts
import { json } from '@fivo/json';
const plugins = [json()];
```

工厂只注册格式描述符，驱动、视图、Worker、样式按需加载。自动编码结合 BOM、来源 charset 和字节特征识别 UTF-8、UTF-16、GBK/GB18030，并保留手动切换。文件大小由宿主 resourcePolicy 限制。

格式操作集中在更多操作菜单；分支按钮按当前选中节点状态切换展开或收起，保留其他分支。原文视图默认隐藏行号。

默认宽容器以只读双栏展示，左侧带原生语法着色的原文、右侧结构树，节点可联动定位原文。`initialMode: 'tree'` 在小于 720px 的容器内只显示结构，`source` 只显示代码区。隐藏的区域按需加载；原文着色不加载结构扫描器或第三方高亮依赖。结构语法失败时仍保留可读原文。

默认自动样式按视图持有租约。宿主选择 `stylePolicy: { mode: 'external' }` 时，需显式引入 `@fivo/dom/styles.css`、`@fivo/text/styles.css` 和 `@fivo/json/styles.css`，供公共外壳、代码区和 JSON 工作区分别校验版本。
