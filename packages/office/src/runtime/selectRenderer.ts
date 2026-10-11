import type { ViewContext, ViewHandle } from '@fivo/dom';
/** 按当前 Office 格式加载原生视图，不让基础 view 层反向依赖渲染器。 */
export async function mountSelectedOffice(
  context: ViewContext,
): Promise<ViewHandle> {
  if (
    context.session.getSnapshot().format === 'ppt' ||
    context.session.getSnapshot().format === 'pptx'
  ) {
    const { mountPresentation } = await import('../renderers/presentation');
    return mountPresentation(context);
  }
  if (
    context.session.getSnapshot().format === 'xls' ||
    context.session.getSnapshot().format === 'xlsx'
  ) {
    const { mountSpreadsheet } = await import('../renderers/spreadsheet');
    return mountSpreadsheet(context);
  }
  const { mountWord } = await import('../renderers/word');
  return mountWord(context);
}
