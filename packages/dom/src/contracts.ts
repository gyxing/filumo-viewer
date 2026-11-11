import type {
  ControllerSnapshot,
  DocumentInput,
  DocumentOpenOptions,
  DocumentPlugin,
  DocumentSession,
  DocumentSource,
  ResourcePolicy,
} from '@filumo/core';
import type {
  CapabilityAction,
  ViewerCapabilities,
} from './capabilities/types';
export type ZoomMode = 'percentage' | 'fit-width' | 'fit-page';
export interface ViewOptions {
  zoom?: number;
  /** 声明初始或宿主更新的模式；省略时单独zoom使用固定比例，其余沿用格式默认。 */
  zoomMode?: ZoomMode;
  /** 自动适应的百分比上限，手动缩放继续使用当前格式支持的范围。 */
  fitMaxZoom?: number;
  theme?: 'light' | 'dark';
  locale?: 'zh-CN' | 'en-US';
  watermark?: string;
  toolbar?: boolean;
  /** 按内置名称或动作 ID 控制工具栏显隐，省略时沿用格式默认呈现。 */
  toolbarVisibility?: Readonly<Record<string, boolean>>;
  /** 宿主操作融入公共工具栏，跟随响应式布局，子查看器默认不继承。 */
  toolbarActions?: readonly CapabilityAction[];
  height?: number | string;
}
export interface StylePolicy {
  nonce?: string;
  mode?: 'auto' | 'external';
}
export interface ViewContext {
  container: HTMLElement;
  session: DocumentSession;
  options: ViewOptions;
  stylePolicy?: StylePolicy;
  onError(error: unknown): void;
  setCapabilities(capabilities: ViewerCapabilities): void;
  /** 子视图只继承已注册插件，不隐式安装格式；拥有者负责销毁。 */
  createChildViewer?(
    container: HTMLElement,
    configuration?: ViewerConfiguration,
  ): ViewerHandle;
}
export interface ViewHandle {
  update(options: ViewOptions): void;
  setActive(active: boolean): void;
  dispose(): Promise<void>;
}
export interface ViewFactory {
  mount(context: ViewContext): Promise<ViewHandle>;
}
export interface ViewerPlugin {
  readonly document: DocumentPlugin;
  loadView(): Promise<ViewFactory>;
}
export interface ViewerConfiguration extends ViewOptions {
  pluginId?: string;
  resourcePolicy?: ResourcePolicy;
  stylePolicy?: StylePolicy;
}
export interface ViewerOptions extends ViewerConfiguration {
  plugins: readonly ViewerPlugin[];
  onReady?(session: DocumentSession): void;
  onError?(error: Error): void;
  onStateChange?(state: ControllerSnapshot): void;
  onCapabilitiesChange?(capabilities: ViewerCapabilities): void;
  /** 宿主显式接管原包下载，适用于需要私有鉴权的大文件。 */
  downloadOriginal?(source: DocumentSource, signal: AbortSignal): Promise<void>;
}
export interface ViewerHandle {
  open(input: DocumentInput, selection?: DocumentOpenOptions): Promise<void>;
  update(options: ViewOptions): void;
  setActive(active: boolean): void;
  getSnapshot(): ControllerSnapshot;
  getCapabilities(): ViewerCapabilities;
  subscribeCapabilities(listener: () => void): () => void;
  subscribe(listener: () => void): () => void;
  destroy(): Promise<void>;
}
