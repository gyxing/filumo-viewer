import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { preparePackageMetadata } from '../../scripts/build/metadata.mjs';
await preparePackageMetadata(process.cwd());
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
