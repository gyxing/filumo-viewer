/** 控件来自当前插件的能力声明，公共外壳不判断 Office 格式。 */
export interface CapabilityAction {
  id: string;
  label: string;
  kind: 'action' | 'toggle' | 'select';
  enabled?: boolean;
  pressed?: boolean;
  value?: string;
  options?: readonly { value: string; label: string }[];
  run(value?: string): void | Promise<void>;
}
export interface ViewerCapabilities {
  actions?: readonly CapabilityAction[];
  zoom?: {
    value: number;
    min: number;
    max: number;
    step: number;
    set(value: number): Promise<void>;
  };
  navigation?: {
    index: number;
    count: number;
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
