// 公共错误文案与格式视图语言一致，不要求解析器或数据源认识 UI 语言。
const MESSAGES = {
  'zh-CN': {
    cells: '选区过大，请缩小选择范围或下载文件',
    text: '复制文本过大，请缩小选择范围或下载文件',
    changed: '复制数据范围已变化，请重新选择',
    incomplete: '复制数据未完整读取',
    unavailable: '当前环境无法复制',
    budget: '复制预算必须为正整数',
    cancelled: '复制已取消',
  },
  'en-US': {
    cells: 'Selection is too large. Select fewer cells or download the file.',
    text: 'Copied text is too large. Select fewer cells or download the file.',
    changed: 'The selected data changed. Select the cells again.',
    incomplete: 'Selected data could not be read completely.',
    unavailable: 'Clipboard access is unavailable in this environment.',
    budget: 'Copy budgets must be positive integers.',
    cancelled: 'Copy cancelled.',
  },
};

/** 返回共享网格通知文案，不改变数据内容。 */
export function gridMessages(locale?: 'zh-CN' | 'en-US') {
  return MESSAGES[locale ?? 'zh-CN'];
}
