import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { codeExpansionSamples } from '../fixtures/public/text-expansion/samples.mjs';
const result = await build({
  stdin: {
    contents:
      "export * from './packages/code/src/fileTypes'; export * from './packages/code/src/highlight/languages'; export * from './packages/code/src/runtime/CodeHighlighter'; export {codeLanguageOptions} from './packages/code/src/view/languageMenu'; export {sampleFileName} from './apps/docs/src/smoke/sampleFileName';",
    resolveDir: process.cwd(),
  },
  alias: { '@fivo/core/text': resolve('packages/core/src/text.ts') },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});

const api = await import(
  'data:text/javascript;base64,' +
    Buffer.from(result.outputFiles[0].text).toString('base64')
);

test('Code 统一识别常用后缀、构建文件名与环境配置，保留专用格式边界', () => {
  const files = {
    'config.yml': 'yaml',
    'settings.toml': 'toml',
    'script.psm1': 'powershell',
    'startup.zsh': 'bash',
    'window.pyw': 'python',
    'data.psd1': 'powershell',
    'script.bat': 'batch',
    'jobs.rake': 'ruby',
    'build.gradle.kts': 'kotlin',
    'query.gql': 'graphql',
    'changes.diff': 'diff',
    Dockerfile: 'dockerfile',
    'build.DOCKERFILE': 'dockerfile',
    'config/Dockerfile.local': 'dockerfile',
    'config\\Dockerfile.conf': 'dockerfile',
    GNUmakefile: 'makefile',
    'build.mk': 'makefile',
    'project/CMakeLists.txt': 'cmake',
    'modules/find.cmake': 'cmake',
    '.env': 'dotenv',
    'config/.env.local': 'dotenv',
  };
  for (const sample of codeExpansionSamples)
    files[sample.file] = sample.language;
  for (const [file, language] of Object.entries(files)) {
    assert.equal(api.detectCodeLanguage(file), language, file);
    assert.equal(api.codeLanguageForName(file), language, file);
  }
  for (const file of [
    'notes.txt',
    'settings.ini',
    'settings.conf',
    'app.cfg',
    'app.properties',
    'sample.json',
    '.env.json',
    'Dockerfile.xml',
    'sample.md',
    'sample.csv',
    'sample.svg',
    'App.vue',
    'App.svelte',
    'toString',
    'constructor',
    '.envlocal',
  ]) {
    assert.equal(api.detectCodeLanguage(file), undefined, file);
    assert.equal(api.codeLanguageForName(file), 'plaintext', file);
  }
});

test('烟测样本保留构建文件原名，旧样本标签仍兼容后缀补全', () => {
  for (const fileName of [
    'CMakeLists.txt',
    'Dockerfile.dev',
    'Makefile',
    '.env.production',
  ]) {
    assert.equal(
      api.sampleFileName({ fileName, label: '公开样本', extension: 'txt' }),
      fileName,
    );
  }
  assert.equal(
    api.sampleFileName({ label: '旧样本', extension: 'txt' }),
    '旧样本.txt',
  );
  assert.equal(
    api.sampleFileName({ label: 'EXAMPLE.TXT', extension: '.txt' }),
    'EXAMPLE.TXT',
  );
  assert.equal(
    api.sampleFileName({ label: 'Makefile', extension: '' }),
    'Makefile',
  );
});

test('语言菜单按类别分隔且所有语言均可选择，纯文本保持末项', () => {
  const choices = api.codeLanguageOptions(false),
    values = choices.map((choice) => choice.value);
  assert.equal(new Set(values).size, values.length);
  assert.deepEqual([...values].sort(), Object.keys(api.codeLanguages).sort());
  assert.equal(choices.at(-1).value, 'plaintext');
  assert.ok(choices.filter((choice) => choice.dividerBefore).length >= 5);
  assert.equal(api.codeLanguageOptions(true).at(-1).label, 'Plain text');
});

test('Text 为明确构建文件名让出常规识别，普通 TXT/配置文件仍由 Text 处理', async () => {
  const { code } = await import('../../packages/code/dist/index.js');
  const { text } = await import('../../packages/text/dist/index.js');
  const codePlugin = code().document,
    textPlugin = text().document;
  for (const name of ['CMakeLists.txt', 'Dockerfile.conf', '.env.properties']) {
    const source = {
      name,
      readAll() {
        throw Error('身份识别不得读取正文');
      },
    };
    assert.equal(await codePlugin.detect(source), true, name);
    assert.equal(await textPlugin.detect(source), false, name);
  }
  for (const name of ['notes.txt', 'app.conf', 'app.properties']) {
    assert.equal(await textPlugin.detect({ name }), true, name);
    assert.equal(await codePlugin.detect({ name }), false, name);
  }
});
test('Code 后缀及关联 grammar 不接管结构格式', () => {
  assert.equal(api.codeLanguageForName('sample.h'), 'c');
  assert.equal(api.codeLanguageForName('sample.tsx'), 'typescript');
  assert.equal(api.codeLanguageForName('sample.jsx'), 'javascript');
  for (const language of ['less', 'scss', 'sass']) {
    assert.equal(api.codeLanguageForName('sample.' + language), language);
    assert.equal(
      api.codeLanguageForName('STYLE.' + language.toUpperCase()),
      language,
    );
    assert.deepEqual(api.grammarNames[language], [language]);
  }
  for (const extension of ['json', 'xml', 'svg', 'custom'])
    assert.equal(api.codeLanguageForName('a.' + extension), 'plaintext');
  for (const language of Object.values(api.codeExtensions))
    assert.ok(api.grammarNames[language]?.length);
  assert.deepEqual(api.grammarNames.html, ['xml', 'javascript', 'css']);
});

test('指定语言高亮保留完整原文，样式与配置不引入内容执行', async () => {
  const compiled = await build({
    stdin: {
      contents:
        "export {loadHighlighter} from './packages/code/src/highlight/loadHighlighter'; export {highlightToDecorations} from './packages/dom/src/text-highlight';",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
  });
  const { loadHighlighter, highlightToDecorations } = await import(
    'data:text/javascript;base64,' +
      Buffer.from(compiled.outputFiles[0].text).toString('base64')
  );
  const samples = {
    less: '@tone: #1677ff;\n.card { color: @tone; &:hover { opacity: .8; } }',
    scss: '$tone: #1677ff;\n.card { color: $tone; &:hover { opacity: .8; } }',
    sass: '$tone: #1677ff\n// 缩进语法\n@mixin themed($value)\n  color: $value\n.card\n  @include themed($tone)\n  &:hover\n    opacity: .8\n  content: "中文 #{1 + 2}"\n',
  };
  for (const [language, source] of Object.entries(samples)) {
    const highlighter = await loadHighlighter(language);
    const html = highlighter.highlight(source),
      ranges = highlightToDecorations(source, html);
    assert.ok(ranges?.length, language);
    assert.ok(
      ranges.some((range) => range.className.includes('hljs-variable')),
      language,
    );
    assert.ok(
      ranges.some((range) => range.className.includes('hljs-selector-class')),
      language,
    );
    assert.ok(
      ranges.every((range) => range.start >= 0 && range.end <= source.length),
      language,
    );
  }
  const sass = await loadHighlighter('sass');
  assert.match(sass.highlight(samples.sass), /hljs-attribute/);
  assert.match(sass.highlight(samples.sass), /hljs-keyword/);
  assert.match(sass.highlight(samples.sass), /hljs-comment/);
  for (const sample of codeExpansionSamples) {
    const highlighter = await loadHighlighter(sample.language);
    const html = highlighter.highlight(sample.text),
      ranges = highlightToDecorations(sample.text, html);
    assert.ok(ranges?.length, sample.file);
  }
  const diff = await loadHighlighter('diff'),
    patch = codeExpansionSamples.find(
      (sample) => sample.language === 'diff',
    ).text;
  assert.match(diff.highlight(patch), /hljs-addition/);
  assert.match(diff.highlight(patch), /hljs-deletion/);
  const dotenv = await loadHighlighter('dotenv');
  const quoted = 'APP_LABEL="中文 # 保留"\n';
  const quotedRanges = highlightToDecorations(quoted, dotenv.highlight(quoted));
  assert.equal(
    quotedRanges.some((range) => range.className.includes('hljs-comment')),
    false,
  );
  assert.ok(
    highlightToDecorations(
      'VALUE=${NAME}\n',
      dotenv.highlight('VALUE=${NAME}\n'),
    ).some((range) => range.className.includes('hljs-variable')),
  );
  const php = await loadHighlighter('php');
  const template = codeExpansionSamples.find(
    (sample) => sample.language === 'php',
  ).text;
  assert.ok(
    highlightToDecorations(template, php.highlight(template)).some((range) =>
      range.className.includes('hljs-variable'),
    ),
  );
  assert.match(
    php.highlight('$message = "示例"; echo $message;'),
    /hljs-string/,
  );
});
test('Worker 不可用与超时只取消增强线程', async () => {
  let terminations = 0;
  const unavailable = new api.CodeHighlighter(() => {
    throw Error('不可用');
  }, 20);
  const payload = {
    text: 'const a=1;',
    language: 'javascript',
    maxChars: 262144,
    maxRanges: 100000,
  };
  assert.equal(
    (await unavailable.run(payload, new AbortController().signal)).kind,
    'plain',
  );
  const slow = new api.CodeHighlighter(
    () => ({
      postMessage() {},
      addEventListener() {},
      removeEventListener() {},
      terminate() {
        terminations++;
      },
    }),
    5,
  );
  assert.equal(
    (await slow.run(payload, new AbortController().signal)).reason,
    'timeout',
  );
  assert.ok(terminations > 0);
});
