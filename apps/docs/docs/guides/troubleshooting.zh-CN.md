---
title: 问题排查
description: 问题排查
keywords:
  - Filumo
  - API
siteLayout: docs
toc: content
---

# 问题排查

<div className="filumo-doc-callout" data-kind="limit">先确认失败发生在哪一层，再调整解析、样式或 Worker 配置。</div>

## 空白预览

先检查 onError、来源类型与容器高度。字符串表示 URL，不代表直接文本。确认服务器返回文件字节而非登录页或错误 HTML，不先盲目叠加 CSS。

## 开发正常但生产 Worker 失败

检查实际 Worker URL、HTTP 状态、JavaScript MIME 和 worker-chunks 相对路径。Vite 使用 worker.format: 'es'。Office 的 auto 可能回退，排错时可用 always 暴露部署错误；Code 的回退策略不同。引擎与 Worker 资源须与所属包版本一致。

## 非根目录或私有部署

确认构建 base 与实际发布目录一致，修改前缀后重新构建。以斜杠开头的地址相对域名根目录，不相对当前项目目录。私有 PDF 应检查凭据、CORS 和真实 206 元数据，不能用外壳已显示证明文件已取得。

## 编码与原文

通过编码菜单重新识别或指定正确字符集。手动切换失败会保留上次成功内容并显示提示。JSON/XML 的解析诊断仍留在专用查看器中，改后缀或文本兜底不能修复结构错误。

## 图片、字体或样式缺失

检查 Markdown 的 baseUrl/resolveResource 与资源授权。本机 File 不自动取得相邻文件权限。external CSS 需安装配套的 DOM 和当前格式样式，保留样式标记并保持所属包版本一致。Office 字体替换可能改变换行和分页。

## 大文档缓慢或占用高

设置来源 maxFileBytes 与对应格式预算。检查活动画布、缓存和 Worker 任务，不能仅凭 DOM 节点数推断性能。默认值是局部预算，不是浏览器总内存或任意文件大小的保证。

## 生命周期与重复打开

保持 plugins 稳定，同一次来源变化只选择 source prop 或命令式 open 驱动。取得句柄后再订阅，卸载时取消订阅。destroy 终止实例，重新打开应新建；KeepAlive 用 setActive 暂停并保留会话。

## 提供可复现反馈

附上包版本、浏览器、宿主构建器及版本、错误码、实际失败资源状态和脱敏步骤，并区分开发与生产。不要在公开 issue 附上私有文档、密码或认证头。常见 Core 错误码见[查看器 API](./viewer-api)。
