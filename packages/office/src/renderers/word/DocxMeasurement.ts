import type { DocxPagePreviewSource } from '../../engine/docx/DocxWordPageSource';
import { collectDocxNoteReferences } from '../../engine/docx/docxNoteReferences';
import type {
  DocxMeasuredBlock,
  DocxMeasurementBatch,
} from '../../engine/docx/docxPagination';
import { projectDocxBlock } from '../../engine/docx/projectDocxRevisionMode';
import type { OfficeRenderContext } from '../../view/types';
import { WordElementContext } from './WordElementContext';
import {
  alignDocxInlineObjectParagraphToGrid,
  measureVisibleDocxBlockHeight,
} from './docxRenderUtils';
import {
  resolveDocxSpacingBefore,
  shouldSuppressDocxContextualSpacing,
} from './support/docxParagraphSpacing';
import { measureDocxFootnotes } from './support/measureDocxFootnotes';
import { measureDocxParagraphLines } from './support/measureDocxParagraphLines';
import { measureDocxTableRows } from './support/measureDocxTableRows';
/** 隐藏测量树使用与显示树相同的原生块渲染器，将原有精确尺寸交回原分页器。 */
export class DocxMeasurement {
  private host: HTMLDivElement;
  private current?: {
    batch: DocxMeasurementBatch;
    context: WordElementContext;
    mode: string;
  };
  private busy = false;
  private closed = false;
  private stops: Array<() => void>;
  private cancel?: () => void;
  private key = 'docx-measure-' + Math.random().toString(36).slice(2);
  constructor(
    private readonly source: DocxPagePreviewSource,
    private readonly base: OfficeRenderContext,
    container: HTMLElement,
  ) {
    this.host = base.document.createElement('div');
    this.host.className = 'office-file-docx-viewer__measure';
    this.host.setAttribute('aria-hidden', 'true');
    container.append(this.host);
    this.stops = [
      source.subscribe(this.schedule),
      base.services.fonts.subscribe(this.schedule),
      base.services.state.subscribe(this.schedule),
    ];
    this.schedule();
  }
  private schedule = () => {
    if (
      this.closed ||
      this.busy ||
      !this.base.services.state.getState().active ||
      !this.base.services.fonts.getSnapshot().ready
    )
      return;
    const batch = this.source.getMeasurementBatch();
    if (!batch) {
      this.current?.context.disposeWord();
      this.current = undefined;
      this.host.replaceChildren();
      return;
    }
    const mode = this.base.services.state.getState().revisionMode;
    if (this.current?.batch.id === batch.id && this.current.mode === mode)
      return;
    this.current?.context.disposeWord();
    const summary = this.source.getSummary(),
      spacing = summary.characterSpacingControl;
    const context = new WordElementContext(
      this.base,
      () => {},
      true,
      spacing === 'compressPunctuation' ||
        spacing === 'compressPunctuationAndJapaneseKana',
    );
    this.current = { batch, context, mode };
    this.cancel = this.base.services.layout.schedule(
      this.key + '-render',
      () => undefined,
      () => this.render(batch, context),
    );
  };
  private render(batch: DocxMeasurementBatch, context: WordElementContext) {
    if (this.closed || this.current?.context !== context) return;
    const start = performance.now(),
      page = batch.sourcePage.page,
      blocks = batch.contextBefore?.previousBlock
        ? [batch.contextBefore.previousBlock, ...batch.blocks]
        : batch.blocks;
    const children = blocks.map((block, index) => {
      const previous = blocks[index - 1],
        suppress = shouldSuppressDocxContextualSpacing(block, previous);
      return context.render('DocxBlockRenderer', {
        block: projectDocxBlock(
          block,
          this.base.services.state.getState().revisionMode,
        ),
        availableWidth: page.width - page.marginLeft - page.marginRight,
        maximumWidth: page.width,
        suppressSpacingBefore: suppress,
        suppressSpacingAfter: shouldSuppressDocxContextualSpacing(
          block,
          blocks[index + 1],
        ),
        spacingBefore: resolveDocxSpacingBefore(block, previous, suppress),
      });
    });
    children.push(
      context.render('WordNoteBlock', {
        notes: batch.sourcePage.footnotes ?? [],
        page,
      }),
    );
    this.host.replaceChildren(
      context.render('DocxPageFrame', { page, zoom: 100, children }),
    );
    this.cancel = this.base.services.layout.schedule(
      this.key,
      () => {
        try {
          return { measurements: this.measure(batch) };
        } catch (error) {
          return { error };
        }
      },
      (result) => {
        if (this.closed || this.current?.context !== context) return;
        if ('error' in result) {
          this.source.failMeasurement(batch, result.error);
          context.disposeWord();
          this.current = undefined;
          this.host.replaceChildren();
          return;
        }
        const measurements = result.measurements;
        this.busy = true;
        void this.source
          .commitMeasurement(batch, measurements, performance.now() - start)
          .catch((error) => this.source.failMeasurement(batch, error))
          .finally(() => {
            this.busy = false;
            if (this.current?.context === context) {
              context.disposeWord();
              this.current = undefined;
              this.host.replaceChildren();
            }
            this.schedule();
          });
      },
    );
  }
  private measure(batch: DocxMeasurementBatch): DocxMeasuredBlock[] {
    const article = this.host.querySelector<HTMLElement>(
      '.office-file-docx-page-frame__article',
    );
    if (!article) throw new Error('缺少原生测量页面');
    const elements = (Array.from(article.children) as HTMLElement[])
      .filter(
        (element) => !element.classList.contains('office-file-word-notes'),
      )
      .slice(batch.contextBefore?.previousBlock ? 1 : 0);
    if (elements.length !== batch.blocks.length)
      throw new Error('原生测量块数量不一致');
    const footnotes = measureDocxFootnotes(
        batch.sourcePage.footnotes ?? [],
        article,
        batch.sourcePage.page,
      ),
      claimed = new Set<string>();
    return batch.blocks.map((block, index) => {
      const element = elements[index],
        height = measureVisibleDocxBlockHeight(elements, index),
        aligned =
          block.type === 'paragraph'
            ? alignDocxInlineObjectParagraphToGrid(
                element,
                block,
                height,
                batch.sourcePage.page.gridLineHeight,
              )
            : { block, height };
      const notes = [
        ...new Set(
          collectDocxNoteReferences([block])
            .filter((note) => note.noteKind === 'footnote')
            .map((note) => note.noteId),
        ),
      ].flatMap((id) => {
        if (claimed.has(id)) return [];
        claimed.add(id);
        const note = footnotes.get(id);
        return note ? [note] : [];
      });
      return {
        block: aligned.block,
        height: aligned.height,
        paragraphBoxHeight:
          block.type === 'paragraph'
            ? element.getBoundingClientRect().height
            : undefined,
        leadingSpacing: parseFloat(
          element.ownerDocument.defaultView!.getComputedStyle(element)
            .marginTop || '0',
        ),
        rowOffset: batch.rowOffsets[block.id],
        originalTableRowCount: batch.originalTableRowCounts[block.id],
        footnoteReserveHeight: notes.reduce(
          (total, note) => total + (note.fragments[0]?.height ?? 0),
          0,
        ),
        measuredFootnotes: notes,
        ...measureDocxParagraphLines(element, aligned.block, aligned.height),
        ...measureDocxTableRows(element, block),
      };
    });
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.cancel?.();
    this.stops.forEach((stop) => stop());
    this.current?.context.disposeWord();
    this.current = undefined;
    this.host.remove();
  }
}
