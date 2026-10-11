/** 已实现的 Office 格式标识；公共 DTO 不引用解析器或框架类型。 */
export type OfficeFormat = 'doc' | 'docx' | 'xls' | 'xlsx' | 'ppt' | 'pptx';
/** 宿主可覆盖的字体别名表，键为源字体，值为有序回退字体。 */
export type OfficeFontAliases = Readonly<Record<string, readonly string[]>>;

/** 宿主按需注册的字体资源，资源本身不会被组件打包。 */
export type OfficeFontSource = Readonly<{
  /** 注册到浏览器字体集合的族名称。 */
  family: string;
  /** CSS 字体源地址，或由宿主提供的 Blob 字体数据。 */
  src: string | Blob;
  /** CSS 字体字重描述。 */
  weight?: string | number;
  /** CSS 字体样式描述。 */
  style?: string;
  /** CSS 字体宽度描述。 */
  stretch?: string;
  /** 可选的 Unicode 范围描述。 */
  unicodeRange?: string;
}>;

/** 字体解析与缺失诊断配置。 */
export type OfficeFontOptions = {
  /** 覆盖内置字体别名的宿主字体映射。 */
  aliases?: OfficeFontAliases;
  /** 追加到每条字体链中的全局回退字体。 */
  fallbackFamilies?: readonly string[];
  /** 在浏览器中按需注册的字体资源，加载失败时继续使用回退链。 */
  sources?: readonly OfficeFontSource[];
  /** 是否通过警告回调报告源字体缺失，默认开启。 */
  warnOnMissing?: boolean;
};

/** Word 文档内部可定位的书签目标。 */
export type OfficeWordHyperlinkTarget = {
  /** 内部书签名称。 */
  bookmark: string;
};

/** 电子表格内部可定位的工作表、单元格或名称目标。 */
export type OfficeSpreadsheetHyperlinkTarget = {
  /** 目标工作表名称；省略时沿用当前工作表。 */
  sheetName?: string;
  /** 目标单元格或单元格区域引用。 */
  cellRef?: string;
  /** 目标工作簿定义名称。 */
  definedName?: string;
};

/** 演示文稿内部可定位的幻灯片目标。 */
export type OfficePresentationHyperlinkTarget = {
  /** 目标幻灯片稳定标识。 */
  slideId?: string;
  /** 目标幻灯片零基索引。 */
  slideIndex?: number;
  /** 相对当前页执行的标准跳转动作。 */
  action?: 'first' | 'last' | 'next' | 'previous';
};

/** Office 文档内部链接支持的三类导航目标。 */
export type OfficeInternalHyperlinkTarget =
  | ({ family: 'word' } & OfficeWordHyperlinkTarget)
  | ({ family: 'spreadsheet' } & OfficeSpreadsheetHyperlinkTarget)
  | ({ family: 'presentation' } & OfficePresentationHyperlinkTarget);

/** 解析器输出且可在线程间传递的统一 Office 超链接。 */
export type OfficeHyperlink =
  | {
      /** 外部链接的协议语义。 */
      kind: 'external' | 'email' | 'phone' | 'file';
      /** 源文档声明的目标地址。 */
      target: string;
      /** Office 中为链接声明的悬停说明。 */
      screenTip?: string;
    }
  | {
      /** 文档内部导航链接。 */
      kind: 'internal';
      /** 已按文档族标准化的内部目标。 */
      target: OfficeInternalHyperlinkTarget;
      /** Office 中为链接声明的悬停说明。 */
      screenTip?: string;
    };

/** 宿主可用于区分链接来源对象的稳定类型。 */
export type OfficeHyperlinkSourceType =
  | 'text'
  | 'cell'
  | 'image'
  | 'shape'
  | 'button';

/** 链接所在渲染对象的稳定身份。 */
export type OfficeHyperlinkSource = {
  /** 链接所在对象类型。 */
  type: OfficeHyperlinkSourceType;
  /** 链接所在对象的稳定标识。 */
  id: string;
};

/** OfficeFileViewer 向宿主报告的一次链接激活事务。 */
export type OfficeHyperlinkActivateEvent = {
  /** 解析器输出的标准链接。 */
  hyperlink: OfficeHyperlink;
  /** 当前正在预览的文件。 */
  file: File;
  /** 当前文件的具体预览格式。 */
  previewKind: OfficeFormat;
  /** 链接所在对象类型。 */
  sourceType: OfficeHyperlinkSourceType;
  /** 链接所在对象的稳定标识。 */
  sourceId: string;
  /** 宿主是否已阻止组件执行默认导航。 */
  readonly defaultPrevented: boolean;
  /** 阻止组件执行默认导航，但不改变安全策略。 */
  preventDefault(): void;
};

/** 内部导航器完成定位时返回 true，无法定位时返回 false。 */
export type OfficeHyperlinkNavigator = (
  target: OfficeInternalHyperlinkTarget,
) => boolean | Promise<boolean>;

/** 链接被激活时采用的输入方式。 */
export type OfficeHyperlinkActivationMode =
  | 'mouse'
  | 'keyboard'
  | 'touch'
  | 'context-menu';

/** 格式渲染节点向共享 Provider 提交的链接激活请求。 */
export type OfficeHyperlinkActivationRequest = {
  /** 当前节点绑定的标准链接。 */
  hyperlink: OfficeHyperlink;
  /** 当前节点的稳定来源信息。 */
  source: OfficeHyperlinkSource;
  /** 用户本次使用的输入方式。 */
  mode: OfficeHyperlinkActivationMode;
};

/** 区分解析、预览降级、链接与字体运行时产生的警告。 */
export type OfficeWarningSource =
  | 'parser'
  | 'partial-preview'
  | 'hyperlink'
  | 'font';

/** 解析、预览降级或链接运行时产生的通用警告。 */
export type OfficeGenericWarning = {
  /** 供宿主稳定识别警告类型的代码。 */
  code: string;
  /** 面向日志或界面展示的警告说明。 */
  message: string;
  /** 产生警告的文件格式。 */
  previewKind: OfficeFormat;
  /** 警告来自解析器、部分预览降级或链接运行时。 */
  source: Exclude<OfficeWarningSource, 'font'>;
};

/** 源文档字体不可用时产生的结构化回退警告。 */
export type OfficeFontFallbackWarning = {
  /** 供宿主稳定识别字体回退的代码。 */
  code: 'FONT_FALLBACK_APPLIED';
  /** 面向日志或界面展示的警告说明。 */
  message: string;
  /** 产生警告的文件格式。 */
  previewKind: OfficeFormat;
  /** 固定标识字体运行时诊断。 */
  source: 'font';
  /** 源文档请求但当前浏览器不可用的字体。 */
  requestedFamily: string;
  /** 浏览器将依次尝试的完整字体链。 */
  candidates: readonly string[];
};

/** 宿主声明的字体资源加载失败时产生的结构化警告。 */
export type OfficeFontSourceLoadWarning = {
  /** 供宿主稳定识别字体资源加载失败。 */
  code: 'FONT_SOURCE_LOAD_FAILED';
  /** 面向日志或界面展示的警告说明。 */
  message: string;
  /** 产生警告的文件格式。 */
  previewKind: OfficeFormat;
  /** 固定标识字体运行时诊断。 */
  source: 'font';
  /** 加载失败的字体族名称。 */
  requestedFamily: string;
  /** 失败后仍会尝试的字体链。 */
  candidates: readonly string[];
};

/** OfficeFileViewer 向宿主报告的非致命问题。 */
export type OfficeWarning =
  | OfficeGenericWarning
  | OfficeFontFallbackWarning
  | OfficeFontSourceLoadWarning;
