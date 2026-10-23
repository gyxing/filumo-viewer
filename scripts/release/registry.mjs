import semver from 'semver';
import { runPnpm } from '../testing/package-manager.mjs';

// 发布与元数据查询使用同一官方源，不能被宿主 scope 映射改到其他 registry。
export const NPM_REGISTRY = 'https://registry.npmjs.org/';

/** 读取结构化响应，不把原始诊断或认证上下文带进错误信息。 */
function parseResponse(value) {
  try {
    return JSON.parse(String(value));
  } catch {
    return undefined;
  }
}

/** 兼容 pnpm 的 JSON 错误和明确的顶层诊断码，不用模糊的 404 文本猜测。 */
function errorCode(error) {
  const response = parseResponse(error.stdout) ?? parseResponse(error.stderr);
  if (typeof response?.error?.code === 'string') return response.error.code;
  const diagnostic =
    String(error.stdout ?? '') + '\n' + String(error.stderr ?? '');
  return diagnostic
    .replace(/\u001b\[[0-9;]*m/g, '')
    .match(/(?:^|\n)\s*(ERR_PNPM_[A-Z0-9_]+|E[0-9]{3})\b/)?.[1];
}

/** 通过 pnpm 沿用用户认证，只有明确的 404 才视为首次发布。 */
export async function readRegistryVersions(name, { root, run = runPnpm }) {
  let value;
  try {
    value = parseResponse(
      await run(
        [
          'view',
          name,
          'versions',
          '--json',
          '--registry',
          NPM_REGISTRY,
          '--config.@filumo:registry=' + NPM_REGISTRY,
          '--loglevel=error',
        ],
        {
          cwd: root,
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 60000,
          maxBuffer: 4 * 1024 * 1024,
        },
      ),
    );
  } catch (error) {
    const code = errorCode(error);
    if (code === 'E404' || code === 'ERR_PNPM_FETCH_404') return [];
    const safeCode =
      typeof code === 'string' && /^[A-Z0-9_]+$/.test(code)
        ? code
        : 'REQUEST_FAILED';
    throw Error('npm registry 查询失败：' + name + '（' + safeCode + '）');
  }
  if (
    value?.error?.code === 'E404' ||
    value?.error?.code === 'ERR_PNPM_FETCH_404'
  )
    return [];
  if (value?.error) throw Error('npm registry 返回错误：' + name);
  const versions = typeof value === 'string' ? [value] : value;
  if (
    !Array.isArray(versions) ||
    !versions.length ||
    versions.some((version) => !semver.valid(version))
  )
    throw Error('npm registry 版本响应无效：' + name);
  return versions.sort(semver.rcompare);
}
