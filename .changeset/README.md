# Filumo 版本与发布记录

十五个正式包独立管理版本，首次保留 0.1.0。这个目录中的 Changeset 是正常的版本管理文件，应随相应代码提交；它与仅保留本地的 docs/superpowers/specs、plans 不同。

## 日常流程

1. 完成同一项功能或修复后运行 `pnpm changeset`，选择真实受影响的包、升级类型并填写中文变更说明。
2. 用 `pnpm release:status` 查看版本计划；必要时补充依赖联动说明。
3. 运行 `pnpm release:version`，应用版本与各包 CHANGELOG，更新升版包 README 的版本标记和锁文件。它不提交 Git，也不构建或测试。
4. 所有修改结束后统一构建、验证并审阅差异。构建依赖包与发布依赖包是不同操作。
5. 审阅并提交版本修改，合入、同步 master；发布命令不会代为执行这些 Git 操作。
6. `pnpm release:plan pdf` 预览，再由维护者明确运行 `pnpm release:publish pdf`。

首次尚无 Changeset 时不需要运行 release:version；统一构建验证后用 `pnpm release:plan --all` 查看十五个 0.1.0，再手动运行 `pnpm release:publish --all`。

## 独立版本规则

- 不使用 fixed/linked 绑定全部包，关闭自动提交和私有包标签；只处理正式 @filumo/\* 包。
- 普通 PDF patch 可只发布 PDF。依赖范围不兼容时 Changesets 会计算必要联动，发布计划还会核对 npm 上的实际可用依赖。
- `workspace:^` 在 pnpm 打包时按本地目标包版本转成 `^版本`。不要把它当成无条件接受所有未来版本。
- 使用新 Core API 的代码必须声明正确的最低 Core 版本，并给修改包和 Core 添加相应 Changeset。语义版本工具无法从源码自动推断 API 要求。
- 只修改项目文档、构建工具且没有改变 npm 包内容时，无须为了凑记录给所有包升版。若公共构建变更影响多个包产物，应把真实受影响包写入 Changeset。
- 发布命令需要明确包名或单独的 `--all`，不传目标只显示用法。依赖缺失不会自动扩大上传范围。

## 检查与恢复

正式发布仅允许干净且同步远程的 master；预览可在开发分支运行。账号需要拥有 @filumo scope 发布权限，认证及 2FA 交由现有 npm/pnpm 配置处理，不向仓库写 Token。

发布先核对 dist 的包身份、版本、公开入口与资源，再核对 pnpm 生成 tarball 的身份、依赖和哈希，最终上传同一 tarball。版本校验不证明源码未改变或测试已经通过，维护者仍须完成对应构建和统一验证。

多包发布不是原子操作。发生错误时查看 `tmp/release-*/result.json`；失败请求可能已经被 npm 接受，先再次运行 release:plan 查询状态，再重试相同发布命令。已存在的版本会跳过，不能用相同版本覆盖已发布内容。

发布过程不自动回滚、不撤包、不创建 Git 标签，也不删除本地临时产物。升版或锁文件更新中断时，先审阅实际文件差异；已经应用过的 Changeset 不应重复加一次补丁来掩盖失败。

详细使用见 [CONTRIBUTING](../CONTRIBUTING.md)。
