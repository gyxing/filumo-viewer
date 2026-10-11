import { FivoError } from '@fivo/core';
import type { OfficeSearchTarget } from '../engine/search/types';
import type {
  OfficeInteractionPort,
  OfficeTarget,
} from '../runtime/interactionTypes';
export type OfficeViewTarget = (
  | OfficeTarget
  | { kind: 'text'; target: OfficeSearchTarget }
) & { sessionId: string };
/** 对跨会话目标做边界校验，实际页面定位仍由对应格式视图提供。 */
export class OfficeNavigationService {
  private page?: (index: number) => void | Promise<void>;
  private closed = false;
  constructor(
    private readonly sessionId: string,
    private readonly port: OfficeInteractionPort,
    private readonly navigateText?: (
      target: OfficeSearchTarget,
    ) => Promise<boolean>,
  ) {}
  bindPageNavigator(navigate: (index: number) => void | Promise<void>) {
    this.page = navigate;
    return () => {
      if (this.page === navigate) this.page = undefined;
    };
  }
  navigatePage = async (index: number) => {
    if (this.closed || !this.page)
      throw new FivoError('COMMAND_NOT_READY', '页面导航尚未就绪');
    await this.page(index);
  };
  async select(target: OfficeViewTarget) {
    if (this.closed) throw new FivoError('OFFICE_DISPOSED', '文档已释放');
    if (target.sessionId !== this.sessionId)
      throw new FivoError('STALE_TARGET', '导航目标属于另一个文档');
    if (target.kind === 'text') {
      if (!(await this.navigateText?.(target.target)))
        throw new FivoError('COMMAND_NOT_READY', '文本定位尚未就绪');
      return;
    }
    await this.port.execute({ type: 'navigate', target, animate: true });
  }
  dispose() {
    this.closed = true;
    this.page = undefined;
  }
}
