---
title: Filumo 文档总览
description: 快速开始、API、格式指南、部署和问题排查入口。
keywords:
  - Filumo
  - file preview
  - document viewer
siteLayout: docs
toc: content
---

# Filumo 文档总览

文档跟随当前仓库源码；实际发布版本以各包 npm 页面为准。源码能力与经过验证的宿主范围分别说明，不以声明代替测试记录。

<nav className="office-viewer-docs__quick-links" aria-label="文档快捷入口"><a href="#quick-start">快速开始</a><a href="#viewer-options">参数与事件</a><a href="#capabilities">工具栏与能力</a><a href="#office-options">Office 配置</a><a href="#development">本地开发</a></nav>

## 开始使用

先选择框架适配器和所需格式包。标准预设包含十类轻量描述符，注册阶段不提前加载解析引擎。

- [快速开始](./guides/quick-start)
- [包总览与安装](./guides/packages)

## 框架接入

[React、Vue 3、Vue 2 与原生 JavaScript](./guides/preview-integration)说明挂载、稳定插件配置、生命周期和 SSR 客户端边界。

## 格式与阅读能力

- [完整格式清单与兼容范围](./guides/compatibility)
- [图片与 PDF](./guides/image-pdf)
- [文本、JSON、Markdown、CSV、XML 与 Code](./guides/text-formats)

## API 参考

- [查看器 API](./guides/viewer-api)：来源、配置、方法、事件、能力及操作标识。
- [格式插件参数](./guides/plugin-api)：各格式的字段类型、默认值、单位与回调区别。

## 部署与问题排查

- [生产部署](./guides/deployment)：Vite/Webpack、Worker、CSP、鉴权、PDF Range 与 Markdown 资源。
- [问题排查](./guides/troubleshooting)：空白预览、资源错误、编码与内存限制。

## 维护与扩展

- [本地开发与测试](./guides/testing)，包括各包独立发版流程。
- [插件扩展协议](./guides/extension-contracts)及后续编辑边界。
- [迁移到 Filumo](./guides/migration)

所有预览均为只读；不执行宏或源码，不提供编辑保存、OCR 或公式重算。
