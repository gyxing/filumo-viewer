// 包描述是构建、源码开发和独立消费的共同入口，避免固定名单逐渐分叉。
export const WORKSPACE_PACKAGES = [
  'core',
  'dom',
  'image',
  'pdf',
  'office',
  'text',
  'json',
  'markdown',
  'react',
  'vue',
  'vue2',
  'viewer',
].map((name) =>
  Object.freeze({
    name,
    entries:
      name === 'dom'
        ? { index: 'src/index.ts', outline: 'src/outline.ts' }
        : name === 'image'
        ? { index: 'src/index.ts', view: 'src/view/index.ts' }
        : name === 'pdf'
        ? { index: 'src/index.ts', assets: 'src/assets.ts' }
        : name === 'text'
        ? {
            index: 'src/index.ts',
            reader: 'src/reader/index.ts',
            view: 'src/view/index.ts',
          }
        : { index: 'src/index.ts' },
    declarationConfig:
      name === 'office' ? 'tsconfig.types.json' : 'tsconfig.json',
    scopedStyles: [
      'office',
      'text',
      'json',
      'markdown',
      'image',
      'pdf',
    ].includes(name),
    assetStrategy: name === 'pdf' ? 'pdfjs' : undefined,
    workerEntry:
      name === 'office'
        ? 'src/engine/parsing/runtime/worker/entry.js'
        : ['text', 'json', 'markdown'].includes(name)
        ? 'src/worker/entry.ts'
        : undefined,
  }),
);

/** 返回受支持的包描述，未知包不允许参与构建或路径拼接。 */
export function getWorkspacePackage(name) {
  const entry = WORKSPACE_PACKAGES.find((item) => item.name === name);
  if (!entry) throw Error('未知包：' + name);
  return entry;
}
