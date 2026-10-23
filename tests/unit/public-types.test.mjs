import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { preparePackageMetadata } from '../../scripts/build/metadata.mjs';
await preparePackageMetadata(process.cwd());

test('公共树富标签为可选配置，原有消费者与 DOM 节点返回类型兼容', () => {
  const filename = resolve('tests/__outline_label_consumer__.ts');
  const source = `
    import type {OutlineTreeOptions} from '../packages/dom/dist/outline';
    type Item = { id: string; children: Item[] };
    const legacy: OutlineTreeOptions<Item> = {
      document, accessors: { getId: item => item.id, getText: item => item.id, isLeaf: item => !item.children.length, getChildren: item => item.children },
      onToggle() {}, onActivate() {},
    };
    const rich: OutlineTreeOptions<Item> = {...legacy, renderLabel(item, owner) { if (!item.id) return undefined; const label=owner.createElement('span'); label.textContent=item.id; return label; }};
    void rich;
  `;
  const options = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    strict: true,
    noEmit: true,
    skipLibCheck: false,
    types: [],
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  };
  const host = ts.createCompilerHost(options),
    original = host.getSourceFile.bind(host);
  host.getSourceFile = (file, language, ...rest) =>
    resolve(file) === filename
      ? ts.createSourceFile(file, source, language, true)
      : original(file, language, ...rest);
  assert.deepEqual(
    ts
      .getPreEmitDiagnostics(ts.createProgram([filename], options, host))
      .map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
      ),
    [],
  );
});

test('新格式公开声明不跟随解析器或第三方实现，reader 无 DOM 依赖', () => {
  for (const entry of [
    'core/text',
    'dom/text',
    'dom/text-messages',
    'dom/text-highlight',
    'dom/split',
    'dom/grid',
    'csv/index',
    'xml/index',
    'code/index',
    'text/index',
    'text/reader',
    'text/view',
    'json/index',
    'markdown/index',
    'image/index',
    'image/view',
    'pdf/index',
    'pdf/assets',
  ]) {
    const [name, file] = entry.split('/');
    const declaration =
      (name === 'text' && file !== 'index') ||
      (name === 'image' && file === 'view')
        ? file + '/index'
        : file;
    const program = ts.createProgram(
      [resolve(`packages/${name}/dist/${declaration}.d.ts`)],
      {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Node10,
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        lib: ['text/reader', 'core/text'].includes(entry)
          ? ['lib.es2022.d.ts', 'lib.webworker.d.ts']
          : ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
        types: [],
      },
    );
    assert.deepEqual(
      ts
        .getPreEmitDiagnostics(program)
        .map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')),
      [],
      entry,
    );
    const files = program.getSourceFiles().map((source) => source.fileName);
    assert.equal(
      files.some((path) =>
        /(?:json|markdown|pdf|csv|xml|code)[\\/]dist[\\/](?:parser|runtime|view)[\\/]|node_modules.*(?:marked|highlight\.js|pdfjs-dist|saxes)/.test(
          path,
        ),
      ),
      false,
      entry,
    );
    if (['text/reader', 'core/text'].includes(entry))
      assert.equal(
        files.some(
          (path) =>
            /lib\.dom/.test(path) ||
            (/packages[\\/]dom[\\/]/.test(path) &&
              !/dist[\\/](?:text-messages\.d\.ts|text[\\/]formatEncodingWarning\.d\.ts)/.test(
                path,
              )),
        ),
        false,
      );
  }
});
test('兜底探测为可选协议，旧插件与 Text 开关保持公开类型兼容', () => {
  const filename = resolve('tests/__text_fallback_consumer__.ts');
  const source = `
    import {createSession} from '../packages/core/dist/index';
    import type {DocumentPlugin, DocumentSource, ResourcePolicy} from '../packages/core/dist/index';
    import {text} from '../packages/text/dist/index';
    const legacy: DocumentPlugin = {
      id:'legacy', protocolVersion:1, extensions:[], mimeTypes:[],
      detect:async()=>false,
      load:async()=>({open:async(source,context)=>createSession({
        ...context, source, format:'legacy', data:undefined,
      })}),
    };
    const extended: DocumentPlugin = {
      ...legacy,
      detectFallback:async(source,signal,policy)=>{
        const resourcePolicy:ResourcePolicy|undefined=policy;
        return !signal.aborted && (source.size??0)<=(resourcePolicy?.maxFileBytes??Infinity);
      },
    };
    const plugin=text({fallback:false});
    const source:DocumentSource={readAll:async()=>new Uint8Array(),dispose:async()=>{}};
    void extended.detectFallback?.(source,new AbortController().signal,{maxFileBytes:4});
    void plugin;
  `;
  const options = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    strict: true,
    noEmit: true,
    skipLibCheck: false,
    types: [],
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  };
  const host = ts.createCompilerHost(options);
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (file, language, ...rest) =>
    resolve(file) === filename
      ? ts.createSourceFile(file, source, language, true)
      : original(file, language, ...rest);
  assert.deepEqual(
    ts
      .getPreEmitDiagnostics(ts.createProgram([filename], options, host))
      .map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
      ),
    [],
  );
});

test('Office 公开声明配置不跟随引擎实现，并允许扩展公开 DTO', () => {
  const file = 'packages/office/tsconfig.types.json';
  const config = ts.readConfigFile(file, ts.sys.readFile);
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    resolve('packages/office'),
  );
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  assert.deepEqual(
    ts
      .getPreEmitDiagnostics(program)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')),
    [],
  );
  const files = program.getSourceFiles().map((f) => f.fileName);
  assert.equal(
    files.some((f) =>
      /office[\\/]src[\\/](engine|renderers|runtime)[\\/]/.test(f),
    ),
    false,
  );
  assert.ok(files.some((f) => f.endsWith('publicTypes.ts')));
});
test('公开 office 声明和实现双向匹配，错误返回类型不能隐藏', () => {
  const filename = resolve('packages/office/types/__contract_check__.ts');
  const actual = ts.parseJsonConfigFileContent(
    ts.readConfigFile('packages/office/tsconfig.json', ts.sys.readFile).config,
    ts.sys,
    resolve('packages/office'),
  );
  const options = {
    ...actual.options,
    noEmit: true,
    emitDeclarationOnly: false,
    rootDir: undefined,
  };
  function diagnostics(source) {
    const host = ts.createCompilerHost(options);
    const old = host.getSourceFile.bind(host);
    host.getSourceFile = (file, language, ...rest) => {
      if (resolve(file) === filename)
        return ts.createSourceFile(file, source, language, true);
      const original = old(file, language, ...rest);
      if (original && file.endsWith('/publicTypes.ts'))
        return ts.createSourceFile(
          file,
          original.text + '\nexport interface AddedPublicDTO { value: string }',
          language,
          true,
        );
      return original;
    };
    return ts
      .getPreEmitDiagnostics(
        ts.createProgram([...actual.fileNames, filename], options, host),
      )
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '));
  }
  const imports =
    "import {office as runtime} from '../src/descriptor'; import {office as declared} from './index';";
  assert.deepEqual(
    diagnostics(
      imports +
        ' const a:typeof runtime=declared; const b:typeof declared=runtime;',
    ),
    [],
  );
  assert.ok(
    diagnostics(imports + ' const bad:typeof runtime=()=>({invalid:true});')
      .length > 0,
  );
  assert.deepEqual(
    diagnostics(
      "import type {AddedPublicDTO} from './index'; const dto:AddedPublicDTO={value:'ok'};",
    ),
    [],
  );
});
