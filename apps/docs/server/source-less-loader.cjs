const { readFileSync } = require('node:fs');
const { join, relative, sep } = require('node:path');

/** 开发样式沿用包的版本作用域，更新由 dumi 的标准样式管线负责替换。 */
module.exports = function sourceLessLoader(source) {
  const { root } = this.getOptions();
  const parts = relative(join(root, 'packages'), this.resourcePath).split(sep);
  const group = parts[0];
  const manifestPath = join(root, 'packages', group, 'package.json');
  this.addDependency(manifestPath);
  const { version } = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const marker = ':root { --fivo-style-' + group + ': ' + version + '; }\n';
  // Office 样式需要版本隔离；DOM 外壳与生产构建相同，保留自身的类选择器边界。
  if (group !== 'office') return marker + source;
  const scope = '.fivo-office-v' + version.replace(/[^a-z0-9]/gi, '-');
  return marker + scope + ' {\n' + source + '\n}';
};
