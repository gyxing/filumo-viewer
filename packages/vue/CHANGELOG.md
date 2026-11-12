# @filumo/vue

## 0.1.1

### Minor Changes

- f77cd60: 宿主工具栏操作支持自定义图标，DOM 图标采用挂载、更新和释放协议。React 接收 ReactNode 并使用 Portal，Vue 3 接收渲染函数并使用 Teleport，Vue 2 使用关联父实例的子组件。主栏和更多菜单共用图标定义，分别管理实例与尺寸观察，保留原有语义图标及显式隐藏能力。React Portal 通过 peerDependencies 使用宿主 react-dom。

### Patch Changes

- f77cd60: 远程格式探测采用共享有界前缀，保留特殊请求的一次读取行为，并补齐无区间归档的文件头识别。

  PDF 预算等待改为资源释放后恢复，正文与缩略图等待不占渲染队列；默认 Worker 复用完整外部资源目录中的同版实现。

  进度更新跳过静态工具栏的重复写入，保持状态回调时机；修正 React 丢弃渲染泄漏回调及 Vue3 重建型配置重复更新。

- Updated dependencies [cf2cd37]
- Updated dependencies [f77cd60]
- Updated dependencies [f77cd60]
- Updated dependencies [f77cd60]
  - @filumo/core@0.1.1
  - @filumo/dom@0.1.1
