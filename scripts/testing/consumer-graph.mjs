import { dirname, resolve } from 'node:path';

/** 只遍历实际执行的静态输出边，不把动态引擎或 Worker 计入初始闭包。 */
export function collectStaticInputs(metafile, entryOutput) {
  const keys = new Map(
    Object.keys(metafile.outputs).map((key) => [resolve(key), key]),
  );
  const visited = new Set(),
    inputs = new Set();
  const visit = (file) => {
    const key = keys.get(resolve(file));
    if (!key || visited.has(key)) return;
    visited.add(key);
    const info = metafile.outputs[key];
    for (const [input, contribution] of Object.entries(info.inputs ?? {}))
      if (contribution.bytesInOutput > 0) inputs.add(input);
    for (const edge of info.imports ?? [])
      if (
        !edge.external &&
        ['import-statement', 'require-call'].includes(edge.kind)
      )
        visit(
          keys.has(resolve(edge.path))
            ? edge.path
            : resolve(dirname(key), edge.path),
        );
  };
  visit(entryOutput);
  return inputs;
}
const identity = (file) =>
  file.replaceAll('\\', '/').replace(/^\0/, '').split('?')[0];
const roleNames = ['driver', 'selector', 'word', 'spreadsheet', 'presentation'];

/** 静态闭包与编译器记录联检；找不到角色不等于没有提前加载。 */
export function auditConsumerGraph(bundle, officeRoot, manifest) {
  if (
    manifest.schemaVersion !== 2 ||
    roleNames.some((role) => !manifest.roles?.[role]?.length)
  )
    throw Error('缺少构建角色映射');
  const initial = new Set();
  const visit = (name) => {
    if (initial.has(name)) return;
    initial.add(name);
    const chunk = bundle[name];
    if (chunk?.type === 'chunk') chunk.imports.forEach(visit);
  };
  Object.values(bundle)
    .filter((item) => item.type === 'chunk' && item.isEntry)
    .forEach((item) => visit(item.fileName));
  const violations = [],
    lazyRoleOutputs = {};
  for (const role of roleNames) {
    const modules = new Set(
      manifest.roles[role].map((file) =>
        identity(resolve(officeRoot, 'dist', file)),
      ),
    );
    const outputs = Object.values(bundle)
      .filter(
        (item) =>
          item.type === 'chunk' &&
          Object.keys(item.modules).some((id) => modules.has(identity(id))),
      )
      .map((item) => item.fileName);
    if (!outputs.length) violations.push('消费产物中没有角色：' + role);
    if (outputs.some((file) => initial.has(file)))
      violations.push('Office 角色进入初始静态闭包：' + role);
    lazyRoleOutputs[role] = outputs;
  }
  const initialModules = [...initial].flatMap((file) =>
    Object.keys(bundle[file]?.modules ?? {}),
  );
  return {
    initialChunks: [...initial],
    lazyRoleOutputs,
    eagerOfficeDriver: violations.some((v) => v.includes('初始')),
    eagerReact: initialModules.some((file) =>
      /(?:^|\/)node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?react(?:-dom)?\//.test(
        identity(file),
      ),
    ),
    violations,
  };
}

/** Vite 单独构建 Worker，从真实入口身份获取输出，不匹配 worker-* 文件名。 */
export function trackWorkerOutput(workerEntry, records) {
  return {
    name: 'fivo-worker-output-audit',
    generateBundle(_options, bundle) {
      for (const item of Object.values(bundle)) {
        if (
          item.type === 'chunk' &&
          item.isEntry &&
          item.facadeModuleId &&
          identity(item.facadeModuleId) === identity(workerEntry)
        )
          records.add(item.fileName);
      }
    },
  };
}
