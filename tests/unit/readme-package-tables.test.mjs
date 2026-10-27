import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { WORKSPACE_PACKAGES } from '../../scripts/workspace-packages.js';
const require = createRequire(resolve('packages/markdown/package.json'));
const { marked } = await import(pathToFileURL(require.resolve('marked')).href);
test('每个包的中英文清单均为同一张完整表格，在线入口保留新标签设置', async () => {
  for (const { name } of WORKSPACE_PACKAGES)
    for (const suffix of ['', '.zh-CN']) {
      const file = `packages/${name}/README${suffix}.md`,
        source = await readFile(file, 'utf8');
      const body = source
        .split('<!-- filumo-packages:start -->')[1]
        ?.split('<!-- filumo-packages:end -->')[0];
      assert.ok(body, file);
      const tables = marked
        .lexer(body)
        .filter((token) => token.type === 'table');
      assert.equal(tables.length, 1, file);
      assert.equal(tables[0].rows.length, WORKSPACE_PACKAGES.length, file);
      for (const { name: entry } of WORKSPACE_PACKAGES)
        assert.ok(
          tables[0].rows.some((row) =>
            row[0].text.includes(
              `https://www.npmjs.com/package/@filumo/${entry})`,
            ),
          ),
          `${file}: ${entry}`,
        );
      for (const target of ['playground', 'docs'])
        assert.match(
          source,
          new RegExp(
            `href="https://gyxing.github.io/filumo-viewer/${target}" target="_blank" rel="noopener noreferrer"`,
          ),
          file,
        );
    }
});
