# @fivo/core

输入来源、插件协议与会话生命周期。

匹配分为两个阶段：先完成所有已注册描述符的 `detect`，均未匹配后才按插件优先级调用可选的 `detectFallback(source, signal, resourcePolicy)`。只有选中的插件才加载驱动；显式 `pluginId` 不进入自动探测，已匹配驱动的读取或解析错误不会触发其他兜底插件。Core 不依赖文本读取器，未注册兜底插件时仍返回 `UNSUPPORTED_FORMAT`。

来源读取后可能才提供远程 MIME；元数据变化时会重新进行常规匹配，再决定是否使用兜底，避免专用插件被抢占。

`DocumentSource.readBlob(signal)` 是可选能力。本地 File/Blob 可直接交给解析器，避免为适配入口先生成全文字节；远程或不支持的来源返回 `undefined`，调用方回退到 `readAll`。`readRange` 允许返回短于请求窗口的数据，请求窗口本身不代表文件长度；来源租约仍校验实际大小、配额、取消和释放状态。远程读取继续共享完整下载缓存。

`getRangeReader(signal)` 可选能力明确提供已知总长的高效区间读取；旧 readRange 不被推测为网络分块能力。本地 Blob 直接切片，远程验证实际 206 与 Content-Range，Range 返回 200 时将响应交回全文读取，避免重复下载。取消、限额、共享租约和来源版本由读取层约束。

当前为工作区预发布实现，尚未发布 npm；格式解析由插件负责，Core 不依赖图片或 PDF 引擎。

请参阅仓库 [框架接入指南](../../apps/docs/docs/guides/preview-integration.md) 和 [兼容范围](../../apps/docs/docs/guides/compatibility.md)。
