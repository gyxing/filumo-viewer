/** 插件声明默认工具栏的呈现；隐藏入口不会移除程序调用能力。 */
export interface ToolbarPresentation {
  visible?: boolean;
  order?: number;
  placement?: 'main' | 'more';
  priority?: number;
  showLabel?: boolean;
}
/** 控件来自当前插件的能力声明，公共外壳不判断 Office 格式。 */
export interface CapabilityAction {
  id: string;
  label: string;
  kind: 'action' | 'toggle' | 'select';
  enabled?: boolean;
  pressed?: boolean;
  value?: string;
  options?: readonly { value: string; label: string }[];
  toolbar?: ToolbarPresentation;
  run(value?: string): void | Promise<void>;
}
export interface ViewerCapabilities {
  actions?: readonly CapabilityAction[];
  zoom?: {
    value: number;
    min: number;
    max: number;
    step: number;
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
