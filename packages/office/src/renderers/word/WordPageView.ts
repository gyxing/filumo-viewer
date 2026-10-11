import {
  pageDrawingImagesFromBlock,
  type PaginatedDocPage,
} from '../../engine/doc/docPagination';
import { projectDocBlocksRevisionMode } from '../../engine/doc/projectDocRevisionMode';
import { collectDocxNoteReferences } from '../../engine/docx/docxNoteReferences';
import {
  projectDocxBlock,
  projectDocxPageContent,
} from '../../engine/docx/projectDocxRevisionMode';
import type {
  DocxBlock,
  DocxNote,
  DocxPageContent,
} from '../../engine/docx/types';
import type { OfficeRenderContext } from '../../view/types';
import type { NativeWordPage, NativeWordSource } from './NativeWordSource';
import { WordElementContext } from './WordElementContext';
import { collectDocNoteReferences } from './elements/DocNoteBlockView';
import {
  resolveDocxSpacingBefore,
  shouldSuppressDocxContextualSpacing,
} from './support/docxParagraphSpacing';
import { WORD_MARKUP_BASE_RAIL_WIDTH } from './support/wordMarkupCalloutLayout';
/** 单页渲染复用全部原生块分支，页眉页脚、修订投影和脚注不交给简化 HTML 替代。 */
export class WordPageView {
  readonly element: HTMLDivElement;
  readonly context: WordElementContext;
  private closed = false;
  private cancel?: () => void;
  private key = 'word-page-' + Math.random().toString(36).slice(2);
  constructor(
    private readonly source: NativeWordSource,
    private readonly page: NativeWordPage,
    private readonly index: number,
    private readonly base: OfficeRenderContext,
    private zoom: number,
  ) {
    this.element = base.document.createElement('div');
    this.element.className = 'fivo-native-word-page';
    const spacing = source.docx?.characterSpacingControl;
    this.context = new WordElementContext(
      base,
      () => this.refresh(),
      false,
      spacing === 'compressPunctuation' ||
        spacing === 'compressPunctuationAndJapaneseKana',
    );
    this.draw();
  }
  refresh() {
    if (this.closed) return;
    this.cancel = this.base.services.layout.schedule(
      this.key,
      () => undefined,
      () => this.draw(),
    );
  }
  update(zoom: number) {
    this.zoom = zoom;
    this.refresh();
  }
  private docxBlocks(
    page: DocxPageContent,
    blocks: DocxBlock[],
    suppressFirst = false,
  ) {
    return blocks.map((block, index) => {
      const previous = blocks[index - 1],
        suppress =
          (suppressFirst && index === 0) ||
          shouldSuppressDocxContextualSpacing(block, previous);
      return this.context.render('DocxBlockRenderer', {
        block,
        availableWidth:
          page.page.width - page.page.marginLeft - page.page.marginRight,
        maximumWidth: page.page.width,
        suppressSpacingBefore: suppress,
        suppressSpacingAfter: shouldSuppressDocxContextualSpacing(
          block,
          blocks[index + 1],
        ),
        spacingBefore: resolveDocxSpacingBefore(block, previous, suppress),
      });
    });
  }
  private draw() {
    if (this.closed) return;
    this.context.begin();
    const mode = this.base.services.state.getState().revisionMode;
    const review =
      this.source.kind === 'docx'
        ? this.source.docx?.review
        : this.source.doc?.review;
    const rail =
      mode === 'markup' && (review?.annotations.length || review?.revisionCount)
        ? WORD_MARKUP_BASE_RAIL_WIDTH
        : 0;
    let frame: Node;
    if (this.source.kind === 'docx') {
      const page = projectDocxPageContent(this.page as DocxPageContent, mode),
        summary = this.source.docx!,
        notes = summary.notes;
      const region = <T>(
        variants: { first?: T; even?: T; default?: T } | undefined,
      ): T | undefined => {
        if (!variants) return undefined;
        if (this.index === 0 && page.differentFirstPage) return variants.first;
        const number = this.index + (page.differentFirstPage ? 0 : 1);
        if (
          (page.headers?.even !== undefined ||
            page.footerPageNumbers?.even !== undefined) &&
          number % 2 === 0 &&
          variants.even !== undefined
        )
          return variants.even;
        return variants.default;
      };
      const header = region(page.headers),
        number = this.index + (page.differentFirstPage ? 0 : 1);
      const footnotes: DocxNote[] =
        page.footnotes ??
        [
          ...new Set(
            collectDocxNoteReferences(page.blocks)
              .filter((note) => note.noteKind === 'footnote')
              .map((note) => note.noteId),
          ),
        ].flatMap((id) => {
          const note = notes?.footnotes.find((note) => note.id === id);
          return note ? [note] : [];
        });
      const children = this.docxBlocks(page, page.blocks, this.index > 0);
      children.push(
        this.context.render('WordNoteBlock', {
          notes: footnotes.map((note) => ({
            ...note,
            blocks: note.blocks.map((block) => projectDocxBlock(block, mode)),
          })),
          page: page.page,
        }),
      );
      if (this.index === this.source.getSnapshot().pages.length - 1)
        children.push(
          this.context.render('WordNoteBlock', {
            notes: (notes?.endnotes ?? []).map((note) => ({
              ...note,
              blocks: note.blocks.map((block) => projectDocxBlock(block, mode)),
            })),
            page: page.page,
            endnotes: true,
          }),
        );
      const footer =
        region(page.footerPageNumbers) && number > 0
          ? this.base.document.createElement('span')
          : undefined;
      if (footer) {
        footer.className = 'office-file-docx-page-frame__page-number';
        footer.textContent = '- ' + number + ' -';
      }
      frame = this.context.render('DocxPageFrame', {
        page: page.page,
        zoom: this.zoom,
        markupRailWidth: rail,
        header: header?.length
          ? this.docxBlocks(page, header, true)
          : undefined,
        footer,
        children,
      });
    } else {
      const page = this.page as PaginatedDocPage,
        summary = this.source.doc!,
        blocks = projectDocBlocksRevisionMode(page.blocks, mode);
      const refs = collectDocNoteReferences(blocks),
        seen = new Set<string>(),
        footnotes = refs.flatMap((ref) => {
          if (ref.noteKind !== 'footnote' || seen.has(ref.noteId)) return [];
          seen.add(ref.noteId);
          const note = summary.notes?.footnotes.find(
            (note) => note.noteId === ref.noteId,
          );
          return note ? [note] : [];
        });
      const children = [
        this.context.render('DocContentRenderer', {
          blocks,
          contentWidth:
            summary.page.width -
            summary.page.marginLeft -
            summary.page.marginRight,
        }),
        this.context.render('DocNoteBlock', {
          notes: footnotes,
          page: summary.page,
        }),
      ];
      if (this.index === this.source.getSnapshot().pages.length - 1) {
        children.push(
          this.context.render('DocNoteBlock', {
            notes: summary.notes?.endnotes ?? [],
            page: summary.page,
            endnotes: true,
          }),
        );
        children.push(
          this.context.render('DocImageGallery', {
            images: this.source.unanchoredImages,
          }),
        );
      }
      frame = this.context.render('DocPageFrame', {
        page: summary.page,
        zoom: this.zoom,
        markupRailWidth: rail,
        headerImage: summary.headerImage,
        pageDrawings: blocks.flatMap(pageDrawingImagesFromBlock),
        footerText:
          summary.footerPageNumbers && this.index >= this.source.footerStart
            ? String(this.index - this.source.footerStart + 1)
            : undefined,
        children,
      });
    }
    this.element.replaceChildren(frame);
    this.context.finish();
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.cancel?.();
    this.context.disposeWord();
    this.element.remove();
  }
}
