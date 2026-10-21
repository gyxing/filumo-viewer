const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { join, relative, sep } = require('node:path');
const less = require('less');

/** 开发样式编译成同一租约声明，稳定 ID 支持热替换而不累积旧规则。 */
module.exports = function sourceLessLoader(source) {
  const callback = this.async(),
    { root } = this.getOptions();
  const group = relative(join(root, 'packages'), this.resourcePath).split(
    sep,
  )[0];
  const manifest = join(root, 'packages', group, 'package.json');
  this.addDependency(manifest);
  const { version } = JSON.parse(readFileSync(manifest, 'utf8'));
  const scope =
    group === 'dom'
      ? undefined
      : 'filumo-' + group + '-v' + version.replace(/[^a-z0-9]/gi, '-');
  const id =
    group +
    ':' +
    version +
    ':' +
    createHash('sha256').update(this.resourcePath).digest('hex').slice(0, 16);
  less
    .render(scope ? '.' + scope + ' {\n' + source + '\n}' : source, {
      filename: this.resourcePath,
    })
    .then(
      (result) => {
        for (const file of result.imports) this.addDependency(file);
        const runtime =
          group === 'dom'
            ? join(root, 'packages/dom/src/styles.ts')
            : '@filumo/dom';
        callback(
          null,
          'import {replaceStyle} from ' +
            JSON.stringify(runtime) +
            ';replaceStyle(' +
            JSON.stringify(group) +
            ',' +
            JSON.stringify(id) +
            ',' +
            JSON.stringify(result.css) +
            ');if(module.hot){module.hot.accept();}',
        );
      },
      (error) => callback(error),
    );
};
