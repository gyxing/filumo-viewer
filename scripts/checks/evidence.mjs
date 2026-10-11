import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

/** 对实际生产源码生成稳定摘要，防止旧浏览器报告被当作当前代码证据。 */
export async function sourceDigest(root) {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) files.push(file);
    }
  }
  for (const name of [
    'core',
    'dom',
    'office',
    'react',
    'vue',
    'vue2',
    'viewer',
  ])
    await visit(join(root, 'packages', name, 'src'));
  for (const area of [
    'apps/docs/src',
    'apps/docs/config',
    'apps/docs/server',
    'scripts',
    'tests/unit',
    'tests/browser',
  ])
    await visit(join(root, area));
  for (const file of [
    'package.json',
    'pnpm-lock.yaml',
    'apps/docs/.dumirc.ts',
    'apps/docs/package.json',
  ])
    files.push(join(root, file));
  const hash = createHash('sha256');
  for (const file of files.sort())
    hash
      .update(relative(root, file).replaceAll('\\', '/'))
      .update(await readFile(file));
  return hash.digest('hex');
}

/** 技术证据与用户验收分开；缺项不能被零失败、空测试或旧报告掩盖。 */
export function assessCompletion({
  digest,
  consumers,
  publicRun,
  localRun,
  formats,
  baseline,
}) {
  const gaps = [];
  const consumerIds = [
    'vanilla',
    'react18',
    'react19',
    'react-strict',
    'vue3',
    'vue26',
    'vue27',
  ];
  for (const id of consumerIds) {
    const item = consumers?.cases?.find((item) => item.id === id);
    if (
      !item ||
      item.build !== 'passed' ||
      item.frozenInstall !== 'passed' ||
      !/^[a-f0-9]{64}$/.test(item.lockSha256 ?? '')
    )
      gaps.push('消费冻结安装：' + id);
  }
  for (const [mode, run] of [
    ['public', publicRun],
    ['local', localRun],
  ]) {
    if (
      !run ||
      run.exitCode !== 0 ||
      run.failed !== 0 ||
      run.skipped !== 0 ||
      run.sourceUnchanged === false
    )
      gaps.push(mode + '浏览器未完整通过');
    if (run?.sourceDigest !== digest) gaps.push(mode + '报告不是当前源码');
    for (const title of requiredChecks(mode))
      if (
        !run?.tests?.some(
          (item) => item.title === title && item.status === 'passed',
        )
      )
        gaps.push('缺少断言：' + title);
  }
  for (const id of [
    'basic-docx',
    'basic-xlsx',
    'basic-pptx',
    'word-long-table',
    'links-doc',
    'links-docx',
    'links-xls',
    'links-xlsx',
    'links-ppt',
    'links-pptx',
    'binary-word',
    'binary-sheet',
    'binary-slides',
  ]) {
    if (
      !formats?.some(
        (item) =>
          item.sample?.id === id && item.status === 'passed' && item.reference,
      )
    )
      gaps.push('同样本布局证据：' + id);
  }
  for (const format of ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']) {
    if (
      !formats?.some(
        (item) => item.sample?.format === format && item.status === 'passed',
      )
    )
      gaps.push('真实格式对照：' + format);
  }
  for (const id of ['word-long-table', 'links-xls', 'links-ppt']) {
    const item = baseline?.samples?.find((item) => item.id === id);
    if (
      !item ||
      item.native?.length !== 5 ||
      !item.native.every(
        (value) => Number.isFinite(value.readyMs) && value.readyMs > 0,
      )
    )
      gaps.push('五次性能对照：' + id);
  }
  if (baseline?.sourceDigest !== digest) gaps.push('性能基线不是当前源码');
  return {
    technicalComplete: gaps.length === 0,
    userAcceptance: 'pending',
    gaps,
  };
}

/** 必需行为名称与测试入口一致，测试数量不能替代具体断言。 */
export function requiredChecks(mode) {
  const ids =
    mode === 'local'
      ? [
          'basic-docx',
          'basic-xlsx',
          'basic-pptx',
          'word-long-table',
          'links-doc',
          'links-docx',
          'links-xls',
          'links-xlsx',
          'links-ppt',
          'links-pptx',
          'binary-word',
          'binary-sheet',
          'binary-slides',
        ]
      : ['basic-docx', 'basic-xlsx', 'basic-pptx', 'word-long-table'];
  return [
    ...ids.map((id) => '固定样本回归：' + id),
    ...(mode === 'local'
      ? ['word-long-table', 'links-xls', 'links-ppt'].map(
          (id) => '五次同环境性能采样：' + id,
        )
      : [
          ...[
            'vanilla',
            'react18',
            'react19',
            'react-strict',
            'vue3',
            'vue26',
            'vue27',
          ].map((id) => id + ' 打包消费、切换、生命周期与自动样式'),
          '严格 CSP、跨 Document 与非 Office 能力',
          '共享原生资源服务',
          '演示文稿元素对照',
          'Word 长表格分页对照',
          '稀疏表格窗口',
          '原件下载实际落盘字节一致',
          '公开文档两种语言、在线示例与隐私隔离',
          '新烟测选择公开文件、配置更新、销毁重开和 DOM 探针',
        ]),
  ];
}
