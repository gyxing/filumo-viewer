# 参与 Fivo 开发

使用 Node 22 和 pnpm 11.10.0，固定版本见 packageManager。

~~~sh
pnpm install --frozen-lockfile
pnpm run check
pnpm test
pnpm run test:consumers
pnpm run test:browser
~~~

组件在 packages，私有文档与烟测在 apps/docs，独立示例在 examples。pnpm smoke 启动本地烟测；真实文件和私有映射只放 tests/fixtures/local。

默认安装不执行 Husky 初始化；需要 Git 钩子时开发者可自行运行 pnpm exec husky install。不要提交本机文件、截图或认证信息。
