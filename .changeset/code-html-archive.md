---
'@filumo/core': minor
'@filumo/dom': minor
'@filumo/code': minor
'@filumo/markdown': patch
'@filumo/viewer': minor
---

增加可取消来源流、单次打开资源上下文、子查看器与原文件下载接管；Code 提供按需 HTML 阅读，Markdown 复用受控 HTML 公共能力。标准预设接入首版 Archive，支持按格式分工的目录浏览与包内预览，WASM 后端有界读取。Archive 初始化版本为 0.1.0，不在此记录中额外升版。

归档预览使用单一顶部工具栏，返回上级和文件名搜索固定在左侧目录上方；子文件能力通过订阅转交，下载菜单区分当前子文件和最外层原压缩包，沿用宿主下载接管与大小限制。
