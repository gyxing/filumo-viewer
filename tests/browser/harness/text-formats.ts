import type { ViewerHandle, ViewOptions } from '@filumo/dom';
import { createViewer } from '@filumo/dom';
import { json } from '@filumo/json';
import { markdown } from '@filumo/markdown';
import { text } from '@filumo/text';

// 资源样本使用本页 Blob，不向外网请求图片。
const assets = new Map([
  [
    'inline-icon.svg',
    URL.createObjectURL(new Blob([
      '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><rect width="12" height="12" fill="#1677ff"/></svg>',
    ], { type: 'image/svg+xml' })),
  ],
  [
    'block-picture.svg',
    URL.createObjectURL(new Blob([
      '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="800"><rect width="1600" height="800" fill="#dfe5ec"/></svg>',
    ], { type: 'image/svg+xml' })),
  ],
  [
    'broken.png',
    URL.createObjectURL(new Blob(['invalid image'], { type: 'image/png' })),
  ],
]);
window.addEventListener('pagehide', () => {
  for (const url of assets.values()) URL.revokeObjectURL(url);
});

/** 固定为奇数字节数，确保 UTF-16 严格解码失败，避免用例取决于样本文字长度。 */
function encodingFixture(content: string, name: string) {
  return new File([content, new TextEncoder().encode(content).length % 2 ? '' : '\n'], name);
}

// 只使用无业务数据的内存样本，验收页面不依赖私有文件或远端内容。
const samples = {
  encodingText: encodingFixture('编码恢复测试\n' + '正文保留\n'.repeat(100), 'encoding.txt'),
  encodingJson: encodingFixture('{"message":"编码恢复测试","nested":{"value":1}}', 'encoding.json'),
  encodingMarkdown: encodingFixture('# 编码恢复测试\n\n' + '## 章节\n\n正文保留\n\n'.repeat(35), 'encoding.md'),
  unreadableText: new File([Uint8Array.of(0xff)], 'unreadable.txt'),
  unknownText: new File([
    '未知后缀文本\n<script>window.filumoFallbackExecuted = true</script>\n配置项=中文',
  ], 'settings.custom'),
  unknownBinary: new File([Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)], 'image.custom'),
  mixedBinary: new File([
    'A'.repeat(70 * 1024), Uint8Array.of(0),
  ], 'mixed.custom'),
  text: new File(
    ['第一行\r\n第二行\t内容\n' + '长行 '.repeat(1000)],
    'sample.txt',
  ),
  gbk: new File([Uint8Array.of(0xd6, 0xd0, 0xce, 0xc4)], 'gbk.txt'),
  json: new File(
    ['{"large":900719925474099312345,"same":1,"same":2,"items":[1,null,true]}'],
    'sample.json',
  ),
  invalid: new File(['{"x": [1,]}'], 'invalid.json'),
  markdown: new File(
    [
      '# 示例\n\n[跳转到定位目标](#定位目标)\n\n### 跳级章节\n\n#### 子章节\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n- [x] 完成\n\n<script>window.untrusted=true</script>\n\n' +
        '普通段落\n\n'.repeat(60) +
        '## 定位目标\n\n这里是目录与锚点定位目标。\n\n```python\nprint("hello")\n```\n\n' +
        '尾部段落\n\n'.repeat(20),
    ],
    'sample.md',
  ),
  shortMarkdown: new File([[
    '# Markdown 示例',
    '',
    '用于检查短文档中多个标题共享底部滚动位置的目录定位。',
    '',
    '## 任务',
    '',
    '- [x] 已完成',
    '- [ ] 待处理',
    '',
    '| 名称 | 值 |',
    '| --- | --- |',
    '| 示例 | 内容 |',
    '',
    '## 代码',
    '',
    '```js',
    'const message = "中文";',
    'console.log(message);',
    '```',
    '',
    '[跳转任务](#任务)',
  ].join('\n')], 'short-outline.md'),
  typeset: new File([[
    '# 排版验收',
    '',
    '## **重点** 与 `API` &amp; [说明](https://example.com)',
    '',
    '[定位格式标题](#重点-与-api-说明)',
    '',
    '**实施步骤：**',
    '',
    '- [ ] Step 1：定义 `WidgetMenu`、`WidgetDefinition`。',
    '- [x] Step 2：已完成。',
    '- 普通列表项',
    '  - [ ] 嵌套任务。',
    '- [ ] 宽松任务第一段。',
    '',
    '  任务内部第二段。',
    '',
    '行内代码：`&amp; <Widget>  a`，原样显示。',
    '',
    '普通文字 [ ] 保留，不是任务项。',
    '',
    '引用式[参考链接][reference]。',
    '',
    '第一行  ',
    '第二行',
    '',
    '软换行 A',
    '软换行 B',
    '',
    '3. 有序列表第三项',
    '4. 有序列表第四项',
    '',
    '> 第一层引用',
    '>',
    '> > 第二层引用',
    '',
    '| 默认 | 左对齐 | 居中 | 右对齐 |',
    '| --- | :--- | :---: | ---: |',
    '| `A&B` | 左 | 中 | 右 |',
    '',
    '---',
    '',
    '行内图标前 ![行内图标](inline-icon.svg) 后面的文字。',
    '',
    '![**独立图片**](block-picture.svg)',
    '',
    '![缺少基址](missing-relative.png)',
    '',
    '![损坏图片](broken.png)',
    '',
    '[不可用链接](javascript:alert(1))',
    '',
    '[无效章节](#不存在的章节)',
    '',
    '### 三级标题',
    '#### 四级标题',
    '##### 五级标题',
    '###### 六级标题',
    '',
    '```text',
    '\t代码块 &amp; <Widget>',
    '```',
    '',
    '[reference]: https://example.com',
  ].join('\n')], 'typeset.md'),
  html: new File([[
    '# HTML 混排验收',
    '',
    '第一行<br/>第二行<br>第三行<br />第四行。',
    '',
    '<a href="https://example.com?a=1&amp;b=2" title="原生链接">链接中的 **加粗文字**</a>，外面的文字。',
    '',
    '[跳转原生表格](#native-table)，<a href="#native-target">跳转折叠标题</a>，<a href="#legacy-anchor">旧式锚点</a>。',
    '',
    '<div style="text-align:center"><span style="color:rgb(128,0,0);font-weight:bold;position:fixed;background-image:url(https://invalid.example/style.png)">居中格式文字</span> <span style="font-size:14px">定号文字</span></div>',
    '',
    '<!--filumo-md-slot-1:0-->',
    '',
    '<center><font color="#800000" face="SimSun" size="+1"><strike>旧式排版</strike></font></center>',
    '',
    '<table id="native-table" style="width:1400px"><caption>原生合并表格</caption><colgroup><col span="2" width="160"></colgroup><thead><tr><th scope="col">名称</th><th scope="col">值</th></tr></thead><tbody><tr><td rowspan="2">合并行</td><td align="right">第一项<br/>第二行</td></tr><tr><td><a href="https://example.com">单元格链接</a></td></tr><tr><td colspan="2">合并列</td></tr></tbody><tfoot><tr><td colspan="2">表尾</td></tr></tfoot></table>',
    '',
    '<details id="folded"><summary>折叠内容</summary><h2 id="native-target">HTML 标题 <em>强调</em></h2><p>折叠区域正文 <code>&lt;tag&gt;</code></p></details>',
    '',
    '<a name="legacy-anchor"></a><p>旧锚点位置</p>',
    '',
    '<p><b>粗体</b>、<i>斜体</i>、<u>下划线</u>、<s>删除线</s>、<mark>高亮</mark>、x<sup>2</sup>、H<sub>2</sub>O、<small>小字</small>、<kbd>Ctrl</kbd></p>',
    '',
    '<ol start="3" reversed><li value="7">指定编号</li><li>下一项</li></ol><ul><li><input type="checkbox" checked>只读原生任务</li></ul>',
    '',
    '<p>前<img src="inline-icon.svg" alt="行内HTML图标" width="12" height="12" onerror="window.htmlUnsafe=true">后</p>',
    '',
    '<figure><img src="block-picture.svg" alt="HTML图片" width="400" height="200"><figcaption>原生图注</figcaption></figure>',
    '',
    '<pre><code class="language-js">const tag = "&lt;div&gt;";</code></pre>',
    '',
    '<custom-note>未知容器保留<strong>内部正文</strong></custom-note>',
    '',
    '<script>window.htmlUnsafe=true</script><style>body { display:none }</style><iframe src="https://invalid.example/frame"></iframe><img src="javascript:alert(1)" alt="非法图片">',
    '',
    '```html',
    '<table><tr><td>代码中的表格</td></tr></table>',
    '```',
  ].join('\n')], 'html.md'),
  plainMarkdown: new File([
    '# 普通文档\n\n文字与 **加粗**。\n\n`<br/>`\n\n```html\n<table>代码</table>\n```',
  ], 'plain.md'),
};
const host = document.createElement('div');
host.id = 'text-format-host';
document.body.append(host);
let viewer: ViewerHandle | undefined;
/** 每次显式操作创建真实会话，测试可观察 Worker、样式与模式切换。 */
async function open(kind: keyof typeof samples, source = false) {
  await viewer?.destroy();
  viewer = createViewer(host, {
    height: 560,
    locale: new URL(location.href).searchParams.get('locale') === 'en-US' ? 'en-US' : 'zh-CN',
    theme: new URL(location.href).searchParams.get('theme') === 'dark'
      ? 'dark' : 'light',
    plugins: [
      text({ fallback: new URL(location.href).searchParams.get('fallback') !== 'off' }),
      json({ initialMode: source ? 'source' : 'tree' }),
      markdown({
        initialMode: source ? 'source' : 'reading',
        resolveResource: (reference) => assets.get(reference) ?? reference,
      }),
    ],
  });
  await viewer.open(samples[kind]);
  document.body.dataset.ready = kind;
}
for (const [label, kind, source] of [
  ['未知文本', 'unknownText', false],
  ['未知二进制', 'unknownBinary', false],
  ['混合文件', 'mixedBinary', false],
  ['文本', 'text', false],
  ['GBK', 'gbk', false],
  ['JSON', 'json', false],
  ['JSON 原文', 'json', true],
  ['无效 JSON', 'invalid', false],
  ['Markdown', 'markdown', false],
  ['Markdown 原文', 'markdown', true],
  ['Markdown 短文档', 'shortMarkdown', false],
  ['Markdown 排版', 'typeset', false],
  ['Markdown HTML', 'html', false],
  ['Markdown 纯文档', 'plainMarkdown', false],
] as const) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.onclick = () => {
    void open(kind, source).catch((error) => {
      document.body.dataset.error = String(error);
    });
  };
  document.body.prepend(button);
}
Object.assign(window, {
  filumoTextFormats: {
    open,
    update: (options: ViewOptions) => viewer?.update(options),
    setActive: (active: boolean) => viewer?.setActive(active),
    getCapabilities: () => viewer?.getCapabilities(),
    dispose: () => viewer?.destroy(),
  },
});
