# 参与 Filumo 开发

使用 Node 22.11 或更新的 Node 22 版本，以及 pnpm 11.10.0；包管理器版本固定在 packageManager。Changesets 开发工具要求 Node ^22.11、^24 或 >=26，本仓库 CI 使用 Node 22。

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm test
pnpm run test:consumers
pnpm run test:browser
```

组件在 packages，私有文档与烟测在 apps/docs，独立示例在 examples。pnpm smoke 启动本地烟测；真实文件和私有映射只放 tests/fixtures/local。

默认安装不执行 Husky 初始化；需要 Git 钩子时开发者可自行运行 pnpm exec husky install。不要提交本机文件、截图或认证信息。

## npm 独立发布

十五个 @filumo/\* 包分别管理版本，正式发布分支为 master。首次发布保持各包 0.1.0，后续只升级变化包及必要联动包。本地统一命令负责版本和发布；当前没有自动 npm 发布工作流。

| 命令                       | 职责                                                   |
| -------------------------- | ------------------------------------------------------ |
| pnpm changeset             | 选择修改包、版本升级类型及变更说明                     |
| pnpm release:status        | 查看待应用的 Changesets 与版本联动                     |
| pnpm release:version       | 更新版本、依赖、各包 CHANGELOG、升版包 README 和锁文件 |
| pnpm release:plan pdf      | 只读查看 PDF 的待发版本与依赖要求                      |
| pnpm release:publish pdf   | 真实发布指定包，必须在 master                          |
| pnpm release:plan --all    | 预览全部正式包中尚未发布的本地版本                     |
| pnpm release:publish --all | 显式发布全部待发版本                                   |

可以使用目录名 `core pdf` 或完整包名 `@filumo/core @filumo/pdf` 指定多个包。包名之外不接受路径或任意通配符；无目标时不发布。预览不打包、不改文件；版本和发布入口均不会自动提交、推送或切换 Git 分支。

### 首次发布

确认当前 registry 的登录账号具有 @filumo scope 的发布权限。先完成全部代码，再运行构建、测试和必要的消费方验证，确认每包 dist、声明、Worker、样式与 PDF 资源完整；首次不需要为了发布先把 0.1.0 改成 0.1.1。

审阅并提交源码、合入并同步 master 后：

```sh
pnpm release:plan --all
# 人工确认上方清单后，才运行真实发布。
pnpm release:publish --all
```

### 单包和依赖联动

修改 PDF 后先添加 Changeset，再查看和应用版本：

```sh
pnpm changeset
pnpm release:status
pnpm release:version
```

然后统一构建与验证。`pnpm build pdf` 会准备 Core、DOM 等前置构建产物，并不意味着这些包必须重新发布。审阅版本、CHANGELOG、README 和锁文件差异，完成 Git 提交并将已验证内容同步到 master 后：

```sh
pnpm release:plan pdf
pnpm release:publish pdf
```

若 PDF 使用了新 Core API，应明确提高最低依赖版本并为相关包添加 Changeset。`workspace:^` 发布时按本地依赖包版本转为普通范围。工具会报告 npm 无兼容版本的依赖；必要时显式选择 `pnpm release:plan core pdf`，确认后再用相同包清单发布。不会为普通 PDF patch 强制升级 Viewer，但超出已有兼容范围时必须审阅联动结果。

已有宿主锁文件不会因 npm 发布自动更新；宿主仍需更新依赖解析才能使用新版本。

### 发布校验和失败恢复

版本查询与上传均由 pnpm 读取当前有效的 registry 配置，包括项目和用户配置文件及环境变量。设置了 `@filumo:registry` 时使用该 scope 的源，否则使用默认 `registry`。

执行前可查看当前配置。

```powershell
pnpm config get registry
pnpm config get '@filumo:registry'
```

私服配置生效后，`release:plan` 查询私服版本，`release:publish` 将产物上传至私服。认证沿用 pnpm 的客户端配置，2FA 由 pnpm 提示。发布命令会检查工作区和远程同步状态。

所有选中包先完成 tarball 身份和依赖核对，再开始按拓扑顺序上传同一份产物，关闭生命周期脚本。dist 的版本检查不能证明源码未改或测试通过，因此发布命令不替代前面的统一验证。

多包失败时查看输出和 `tmp/release-*/result.json`。请求报错不一定表示 npm 未接受，先重新预览；已经存在的版本会跳过，再重试相同目标即可。不覆盖已有版本，不自动撤包、回滚或创建 Git 标签。

设计文档与计划仍不提交；`.changeset/*.md` 是正常的发版记录，需随相关代码提交。
