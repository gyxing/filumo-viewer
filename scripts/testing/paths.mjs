import { resolve } from 'node:path';
/** 所有结果路径区分公开和本机，不能把私有报告上传 CI。 */
export function getTestPaths(root, mode = 'public') {
  if (!['public', 'local'].includes(mode)) throw Error('未知测试模式');
  return {
    fixturesRoot: resolve(root, 'tests/fixtures', mode),
    referenceRoot: resolve(root, 'tests/fixtures', mode, 'reference'),
    resultsRoot: resolve(root, 'tmp/testing', mode),
  };
}
