import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';

/** 复用启动当前任务的 pnpm CLI，避免 Windows 只存在 cmd 包装器时找不到 pnpm.exe。 */
export function runPnpm(args, options = {}) {
  const cli = process.env.FILUMO_PNPM_CLI || process.env.npm_execpath;
  if (cli && /pnpm/i.test(basename(cli))) {
    return /\.exe$/i.test(cli)
      ? execFileSync(cli, args, options)
      : execFileSync(process.execPath, [cli, ...args], options);
  }
  return execFileSync(
    process.platform === 'win32' ? 'pnpm.exe' : 'pnpm',
    args,
    options,
  );
}
