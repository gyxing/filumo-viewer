/** 插件声明默认工具栏的呈现；隐藏入口不会移除程序调用能力。 */
export interface ToolbarPresentation {
  visible?: boolean;
  order?: number;
  placement?: 'main' | 'more';
  /** 值越大越优先保留；Infinity 固定在主栏，空间不足时换行。 */
  priority?: number;
  /** 控制主栏名称显示；无图标按钮保留名称，选择控件始终显示当前选中值。 */
  showLabel?: boolean;
}
/** 选择值与独立命令共用选项列表，命令不参与选中态。 */
export interface CapabilityOption {
  value: string;
  label: string;
  kind?: 'choice' | 'action';
  dividerBefore?: boolean;
}
/** 控件来自当前插件的能力声明，公共外壳不判断 Office 格式。 */
export interface CapabilityAction {
  id: string;
  label: string;
  kind: 'action' | 'toggle' | 'select';
  enabled?: boolean;
  pressed?: boolean;
  value?: string;
  options?: readonly CapabilityOption[];
  /** 显示值相同时仍允许执行，例如把自动识别结果固定为手动编码。 */
  allowReselect?: boolean;
  /** 菜单可把主栏开关呈现为命令；未声明时沿用 kind 的默认交互。 */
  menu?: { kind?: 'action' | 'toggle'; closeOnRun?: boolean };
  toolbar?: ToolbarPresentation;
  run(value?: string): void | Promise<void>;
}
/** 同一个下载入口可提供原件与嵌入内容等目标，外壳统一处理状态和错误。 */
export type DownloadTarget = {
  id: string;
  label: string;
  enabled?: boolean;
  reason?: string;
} & (
  | { kind: 'original' }
  | { kind: 'custom'; run(signal: AbortSignal): void | Promise<void> }
);
export interface ViewerCapabilities {
  /** 由 DOM 外壳补充的有效原件下载命令，包含宿主接管后的可用状态。 */
  download?: {
    enabled: boolean;
    reason?: string;
    run(): Promise<void>;
  };
  downloadTargets?: readonly DownloadTarget[];
  originalDownload?: {
    enabled?: boolean;
    reason?: string;
    run?(signal: AbortSignal): void | Promise<void>;
  };
  actions?: readonly CapabilityAction[];
  zoom?: {
    value: number;
    min: number;
    max: number;
    step: number;
    /** 未指定时使用 25%～200% 的公共预设，并按当前格式的范围过滤。 */
    presets?: readonly number[];
    mode?: {
      value: string;
      options: readonly { value: string; label: string }[];
      set(value: string): Promise<void>;
    };
    toolbar?: ToolbarPresentation;
    set(value: number): Promise<void>;
  };
  navigation?: {
    index: number;
    count: number;
    toolbar?: ToolbarPresentation & {
      layout?: 'paging' | 'buttons';
      previousLabel?: string;
      nextLabel?: string;
    };
    goTo(index: number): Promise<void>;
  };
  search?: {
    query: string;
    resultCount: number;
    currentIndex: number;
    searching: boolean;
    setQuery(value: string): Promise<void>;
    next(): Promise<void>;
    previous(): Promise<void>;
  };
}
