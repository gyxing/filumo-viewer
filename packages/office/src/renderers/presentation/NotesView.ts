import type { SpeakerNotesModel } from '../../engine/presentation/types';
import type { OfficeRenderContext } from '../../view/types';
/** 原生备注保持段落、项目符号和原有 120px/65% 拖拽约束。 */
export class NotesView {
  readonly element: HTMLElement;
  private handle: HTMLDivElement;
  private content: HTMLDivElement;
  private height = 220;
  private resize?: ResizeObserver;
  private drag?: { id: number; y: number; height: number };
  constructor(private readonly context: OfficeRenderContext) {
    const doc = context.document;
    this.element = doc.createElement('section');
    this.element.className = 'office-file-pptx-speaker-notes';
    this.handle = doc.createElement('div');
    this.handle.className = 'office-file-pptx-speaker-notes__resize-handle';
    this.handle.setAttribute('role', 'separator');
    this.handle.setAttribute('aria-orientation', 'horizontal');
    this.handle.tabIndex = 0;
    this.content = doc.createElement('div');
    this.content.className = 'office-file-pptx-speaker-notes__content';
    this.element.append(this.handle, this.content);
    this.handle.onpointerdown = (event) => {
      this.drag = {
        id: event.pointerId,
        y: event.clientY,
        height: this.height,
      };
      this.handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    this.handle.onpointermove = (event) => {
      if (this.drag?.id === event.pointerId)
        this.setHeight(this.drag.height + this.drag.y - event.clientY);
    };
    this.handle.onpointerup = (event) => {
      this.drag = undefined;
      if (this.handle.hasPointerCapture(event.pointerId))
        this.handle.releasePointerCapture(event.pointerId);
    };
    this.handle.onpointercancel = () => {
      this.drag = undefined;
    };
    this.handle.onkeydown = (event) => {
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        this.setHeight(this.height + (event.key === 'ArrowUp' ? 20 : -20));
      }
    };
    const Resize = doc.defaultView?.ResizeObserver;
    if (Resize) this.resize = new Resize(() => this.setHeight(this.height));
  }
  private setHeight(value: number) {
    const max = Math.max(
      120,
      (this.element.parentElement?.clientHeight ?? 340) * 0.65,
    );
    this.height = Math.max(120, Math.min(max, value));
    this.element.style.height = this.height + 'px';
    this.handle.setAttribute('aria-valuemin', '120');
    this.handle.setAttribute('aria-valuemax', String(Math.round(max)));
    this.handle.setAttribute('aria-valuenow', String(Math.round(this.height)));
  }
  update(notes: SpeakerNotesModel | undefined, visible: boolean) {
    this.element.hidden = !visible;
    this.element.setAttribute(
      'aria-label',
      this.context.locale === 'en-US' ? 'Speaker notes' : '演讲者备注',
    );
    this.handle.setAttribute(
      'aria-label',
      this.context.locale === 'en-US' ? 'Resize notes' : '调整备注高度',
    );
    if (this.element.parentElement)
      this.resize?.observe(this.element.parentElement);
    this.setHeight(this.height);
    this.content.replaceChildren();
    if (!notes?.paragraphs.length) {
      const empty = this.context.document.createElement('div');
      empty.className = 'office-file-pptx-speaker-notes__empty';
      empty.textContent =
        this.context.locale === 'en-US' ? 'No notes' : '暂无备注';
      this.content.append(empty);
      return;
    }
    for (const paragraph of notes.paragraphs) {
      const p = this.context.document.createElement('p');
      p.className =
        'office-file-pptx-speaker-notes__paragraph office-file-pptx-speaker-notes__paragraph--level-' +
        Math.min(5, Math.max(0, paragraph.level ?? 0));
      if (paragraph.bullet && !paragraph.bullet.none && paragraph.bullet.char) {
        const bullet = this.context.document.createElement('span');
        bullet.className = 'office-file-pptx-speaker-notes__bullet';
        bullet.style.fontFamily =
          this.context.services.fonts.resolveFamily(
            paragraph.bullet.fontFamily,
          ) ?? '';
        bullet.textContent = paragraph.bullet.char;
        p.append(bullet);
      }
      for (const run of paragraph.runs) {
        const span = this.context.document.createElement('span');
        span.textContent = run.text;
        p.append(span);
      }
      this.content.append(p);
    }
  }
  dispose() {
    this.resize?.disconnect();
    this.element.remove();
  }
}
