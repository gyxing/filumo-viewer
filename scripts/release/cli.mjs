import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPnpm } from '../testing/package-manager.mjs';
import { createReleasePlan } from './plan.mjs';
import { publishRelease } from './publish.mjs';
import { readRegistryVersions } from './registry.mjs';
import { hasPendingChangesets, versionPackages } from './version.mjs';
import { loadReleasePackages, selectReleasePackages } from './workspace.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [command, ...args] = process.argv.slice(2);
const usage =
  '用法：pnpm release:status | release:version | release:plan <pdf ...|--all> | release:publish <pdf ...|--all>\n发布预览可在开发分支运行；真实发布仅允许干净且已同步远程的 master。';

/** 命令入口只调度明确职责，预览不会隐式打包，发布不会隐式升版或构建。 */
async function main() {
  if (!['status', 'version', 'plan', 'publish'].includes(command))
    throw Error(usage);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage);
    return;
  }
  if (command === 'status' || command === 'version') {
    if (args.length) throw Error('该命令不接受额外参数\n' + usage);
    if (command === 'status') {
      runPnpm(['exec', 'changeset', 'status'], {
        cwd: root,
        stdio: 'inherit',
        env: { ...process.env, HUSKY: '0' },
      });
    } else {
      const changed = await versionPackages(root);
      if (changed.length) console.table(changed);
      else
        console.log(
          '没有待应用的 Changeset，版本保持不变；首次 0.1.0 可直接预览发布。',
        );
    }
    return;
  }
  const packages = await loadReleasePackages(root);
  const selected = selectReleasePackages(args, packages);
  if (!selected.length) {
    console.log(usage);
    return;
  }
  if (command === 'plan') {
    if (await hasPendingChangesets(root))
      console.log(
        '存在尚未应用的 Changeset；下方只展示当前 manifest，升版请先运行 release:version。',
      );
    const plan = await createReleasePlan(packages, selected, (name) =>
      readRegistryVersions(name, { root }),
    );
    console.table(
      plan.rows.map((row) => ({
        包名: row.name,
        本地版本: row.version,
        npm版本: row.registryVersions[0] ?? '未发布',
        状态: row.status === 'pending' ? '待发布' : '已存在，跳过',
        内部依赖: row.dependencies
          .map((edge) => edge.name + '@' + edge.range)
          .join(', '),
      })),
    );
    console.log('发布顺序：' + (plan.order.join(' → ') || '无待发布版本'));
    if (plan.required.length)
      console.log(
        '必要联动包：' +
          plan.required.join(', ') +
          '\n请把必要依赖加入目标清单后重新预览；工具不会自动扩大范围。',
      );
    if (plan.errors.length)
      throw Error(plan.errors.map((error) => error.message).join('\n'));
    console.log(
      '此命令只读 registry 和包配置；尚未打包、验证运行效果或发布 npm。',
    );
  } else {
    const result = await publishRelease(root, selected);
    console.log('已发布：' + (result.published.join(', ') || '无须发布'));
    if (result.skipped.length)
      console.log('已存在，跳过：' + result.skipped.join(', '));
    if (result.file) console.log('发布记录：' + result.file);
  }
}

main().catch((error) => {
  console.error(error.message);
  if (error.report) {
    console.error('已完成：' + (error.report.published.join(', ') || '无'));
    console.error('失败或待确认：' + error.report.failed);
    console.error('待重新查询：' + error.report.remaining.join(', '));
  }
  process.exitCode = 1;
});
