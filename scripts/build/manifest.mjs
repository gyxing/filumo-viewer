import { isAbsolute, relative, resolve } from 'node:path';

export const OFFICE_ROLES = {
  driver: 'src/runtime/openOffice.ts',
  selector: 'src/runtime/selectRenderer.ts',
  word: 'src/renderers/word/index.ts',
  spreadsheet: 'src/renderers/spreadsheet/index.ts',
  presentation: 'src/renderers/presentation/index.ts',
};
/** 将编译器提供的真实输入/输出映射发布为相对路径，不根据 chunk 名称推测功能。 */
export function createBuildManifest(
  metadata,
  main,
  worker,
  { root, directory },
) {
  const from = (base, file) =>
    relative(base, resolve(root, file)).replaceAll('\\', '/');
  const outRoot = resolve(directory, 'dist');
  const outputs = Object.entries(main.outputs).map(([file, info]) => ({
    file: from(outRoot, file),
    entryPoint: info.entryPoint ? from(directory, info.entryPoint) : undefined,
    inputs: Object.keys(info.inputs)
      .filter((input) => info.inputs[input].bytesInOutput > 0)
      .map((input) => from(directory, input))
      .filter((input) => !input.startsWith('..') && !isAbsolute(input)),
    imports: info.imports.map((item) => ({
      path: item.external ? item.path : from(outRoot, item.path),
      kind: item.kind,
      external: !!item.external,
    })),
  }));
  if (
    outputs.some((item) => item.file.startsWith('..') || isAbsolute(item.file))
  )
    throw Error('构建输出路径越界');
  const roles = {};
  if (metadata.group === 'office')
    for (const [role, input] of Object.entries(OFFICE_ROLES)) {
      const files = outputs
        .filter((output) => output.inputs.includes(input))
        .map((output) => output.file);
      if (!files.length) throw Error('缺少 Office 构建角色：' + role);
      roles[role] = files;
    }
  const workerOutputs = worker
    ? Object.keys(worker.outputs).map((file) => from(outRoot, file))
    : [];
  return {
    schemaVersion: 2,
    package: metadata.name,
    version: metadata.version,
    outputs,
    roles,
    worker: worker
      ? { publicPath: 'worker.js', outputs: workerOutputs }
      : undefined,
  };
}
