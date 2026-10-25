---
title: Filumo 插件与后续编辑扩展
description: Filumo 的 DocumentPlugin、ViewerPlugin、共享文本与 DOM 视图、会话资源及只读扩展协议。
keywords:
  - Filumo
  - file preview
  - document viewer
  - 文件预览
siteLayout: docs
toc: content
---

# 插件与后续编辑扩展

当前 源码工作区包含 Office、Text、JSON、Markdown、Image、PDF、CSV、XML、Code 九类只读插件，实际发布状态以对应 npm 页面为准。本页说明现有扩展协议及尚未提供的编辑保存能力。

## 分层职责

| 层       | 负责                                   | 不负责                       |
| -------- | -------------------------------------- | ---------------------------- |
| Core     | 来源、格式选择、加载取消、会话生命周期 | DOM、React/Vue、具体格式排版 |
| DOM      | 宿主容器、预览外壳、通用能力、样式租约 | 解释 Office 内部模型         |
| 格式插件 | 识别、解析、资源与格式视图             | 管理宿主框架生命周期         |
| 框架适配 | props、事件、挂载/卸载、KeepAlive      | 重新解析一份文档或复制工具栏 |

未来格式包可以采用独立 @filumo/\* 命名，但只有实际需要时才创建。宿主显式注册插件；新增包不会自动进入标准预设或其他宿主的依赖。

公共文本处理来自 @filumo/core/text；原文、大纲与分栏来自 DOM 子入口，格式包不通过 Text 包反向复用公共视图。完整包关系见[包总览](./packages)。

## DocumentPlugin

| 字段                         | 接口约定                                      |
| ---------------------------- | --------------------------------------------- |
| id                           | 稳定且唯一的插件 ID                           |
| protocolVersion              | 当前为 1                                      |
| extensions / mimeTypes       | 元数据识别提示                                |
| priority                     | 可选优先级，较高者先探测                      |
| detect(source, signal)       | 轻量、可取消识别，返回 Promise&lt;boolean&gt; |
| detectFallback(source, signal, policy) | 可选；常规探测全部拒绝后才兜底，遵守取消与来源预算 |
| load()                       | 按需取得 DocumentDriver                       |
| driver.open(source, context) | 创建 DocumentSession                          |

未显式指定 pluginId 时，Core 根据元数据排列候选项并探测；显式 ID 必须已经注册。重名、协议版本不匹配或未注册 ID 都会失败。

## ViewerPlugin

ViewerPlugin 包含 document 和 loadView()。loadView 返回含 mount(context) 的工厂；mount 返回 update、setActive 和 dispose。

一个最小的自定义 .note 插件示例，仅用于说明协议：

```ts | pure
import { createSession } from '@filumo/core';
import type { ViewerPlugin } from '@filumo/dom';

export const notePlugin: ViewerPlugin = {
  document: {
    id: 'note-example',
    protocolVersion: 1,
    extensions: ['.note'],
    mimeTypes: ['text/plain'],
    async detect(source) {
      return source.name?.endsWith('.note') === true;
    },
    async load() {
      return {
        async open(source, context) {
          const bytes = await source.readAll(context.signal);
          return createSession({
            ...context,
            source,
            format: 'note',
            data: new TextDecoder().decode(bytes),
          });
        },
      };
    },
  },
  async loadView() {
    return {
      async mount(context) {
        const text = context.container.ownerDocument.createElement('pre');
        text.textContent = String(context.session.data);
        context.container.append(text);
        context.setCapabilities({});
        return {
          update() {},
          setActive(active) {
            text.hidden = !active;
          },
          async dispose() {
            text.remove();
          },
        };
      },
    };
  },
};
```

这里用 textContent 处理文档内容，不把不可信文本当作 HTML 执行。实际插件把较重的解析器和视图放在动态 import 中，并在取消后释放迟到结果。

## 会话与资源所有权

DocumentSession 暴露 id、signal、source、data、getSnapshot、subscribe、cancel 和 dispose。data 是格式数据，不应依赖框架组件实例；跨线程数据要可序列化。

每次 open 的来源、Worker、对象 URL、字体、图表和订阅必须有清晰的清理者。文档切换、解析失败、组件卸载都需要释放。第三方解析器不响应取消时，Core 会隔离迟到会话，插件仍应主动遵守信号。

## 通用能力声明

视图通过 context.setCapabilities 提交 zoom、navigation、search 和 actions。只声明真实实现的能力；没有分页的格式不要虚构 pageCount。默认外壳根据快照生成控件，宿主也可订阅能力绘制自定义 UI。

actions 提供 id、label、kind、enabled、pressed/value/options 和 run。分页 index 为零基；表格使用稳定 sheet ID，不用展示名称作为身份。

actions、zoom 和 navigation 的可选 toolbar 字段只控制默认界面，不删除能力或动作。visible 为 false 时隐藏；order 按升序排列，同值保留声明顺序；placement 为 main 时优先主栏，为 more 时固定收纳。priority 越小越先在空间不足时收纳。未指定时沿用原默认行为。动作可通过 showLabel: false 隐藏选择框外部标签，可访问名称仍保留。

navigation.toolbar.layout 默认为 paging，显示页码与前后按钮；buttons 只显示前后按钮，可通过 previousLabel / nextLabel 提供文案。zoom.presets 提供比例列表；zoom.mode 包含 value、options 和异步 set(value)，选项值由插件解释，DOM 外壳不识别格式。mode.value 命中 options 时表示选中该模式，否则使用手动比例。

```ts | pure
context.setCapabilities({
  actions: [
    {
      id: 'custom.inspect',
      label: '检查',
      kind: 'action',
      toolbar: { order: 10, placement: 'main' },
      run: () => console.info('检查文档'),
    },
  ],
  navigation: {
    index: 0,
    count: 3,
    toolbar: { visible: false },
    goTo: async (index) => console.info(index),
  },
});
```

原有未声明 toolbar、presets、mode 的插件不需要修改。宿主的自定义工具栏可以忽略默认展示信息并直接调用现有能力。

## 后续编辑与保存

预览的输入来源、会话、能力和框架适配可以复用，但编辑应增加独立的命令、变更状态、历史、权限和格式写入能力。

当前没有 editor、save、applyChanges 或 undo API。不要把内部模型直接当可变编辑状态，也不要将只读修订投影当成修改原文件。

原件导出 exportOriginal 仅返回原始字节副本。未来编辑后保存需格式 writer、导出校验和宿主持久化接口，不能用原件下载冒充。待确定真实编辑需求后再增加包与接口，不预发空壳编辑包。

## 发布边界

公开入口以各包 package.json 的 exports 为准。不要依赖 src、dist/chunks、Worker 私有消息或解析器内部模型。扩展包应独立验证 SSR 导入安全、懒加载、样式隔离、取消和框架消费。
