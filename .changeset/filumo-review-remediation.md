---
'@filumo/core': patch
'@filumo/archive': patch
'@filumo/pdf': patch
'@filumo/dom': patch
'@filumo/react': patch
'@filumo/vue': patch
---

远程格式探测采用共享有界前缀，保留特殊请求的一次读取行为，并补齐无区间归档的文件头识别。

PDF 预算等待改为资源释放后恢复，正文与缩略图等待不占渲染队列；默认 Worker 复用完整外部资源目录中的同版实现。

进度更新跳过静态工具栏的重复写入，保持状态回调时机；修正 React 丢弃渲染泄漏回调及 Vue3 重建型配置重复更新。
