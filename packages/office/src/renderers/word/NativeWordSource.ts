import { abortError, notify, throwIfAborted } from '@filumo/core';
import type { WordRevisionMode } from '../../engine/annotations/types';
import type { DocWordPreviewSummary } from '../../engine/doc/DocWordPageSource';
import {
  paginateDocBlocks,
  type PaginatedDocPage,
} from '../../engine/doc/docPagination';
import { projectDocBlocksRevisionMode } from '../../engine/doc/projectDocRevisionMode';
import { docBookmarkMarkerIdsFromBlock } from '../../engine/doc/readDocBookmarks';
import type { DocDocument, DocImage } from '../../engine/doc/types';
import {
  DocxWordPageSource,
  type DocxPagePreviewSource,
  type DocxWordPreviewSummary,
} from '../../engine/docx/DocxWordPageSource';
import { projectDocxPageContent } from '../../engine/docx/projectDocxRevisionMode';
import type { DocxDocument, DocxPageContent } from '../../engine/docx/types';
import type { OfficeFileViewerPreviewState } from '../../engine/parsing/internalTypes';
import type { WordOutlineProvider } from '../../engine/word/WordOutlineProvider';
import type {
  WordPageSource,
  WordPageSourceSnapshot,
} from '../../engine/word/WordPageSource';
import { collectDocSearchBlocks } from '../../engine/word/WordSearchProvider';
import { collectWordPerformanceStats } from '../../engine/word/collectWordPerformanceStats';
import { createMaterializedWordPageSource } from '../../engine/word/createMaterializedWordPageSource';
import { createMemoryWordOutlineProvider } from '../../engine/word/createMemoryWordOutlineProvider';
import { createWordPerformanceProfile } from '../../engine/word/performance';
export type NativeWordPage = DocxPageContent | PaginatedDocPage;
/** 桥接现有分页 Source；已物化 DOCX 复用同一测量/分页队列，不再次解析文件。 */
export class NativeWordSource implements WordPageSource<NativeWordPage> {
  readonly kind: 'doc' | 'docx';
  readonly measurement?: DocxPagePreviewSource;
  readonly outline: WordOutlineProvider;
  private source: WordPageSource<NativeWordPage>;
  private snapshot: WordPageSourceSnapshot;
  private stop: () => void;
  private listeners = new Set<() => void>();
  private closed = false;
  private revision = 0;
  generation = 0;
  private docxMetadata?: () => DocxDocument | DocxWordPreviewSummary;
  private docMetadata?: () => DocDocument | DocWordPreviewSummary;
  private rawDoc?: DocDocument;
  private calibrated = new Map<string, number>();
  private mode: WordRevisionMode;
  private owned = false;
  calibrationAllowed = false;
  footerStart = 1;
  unanchoredImages: DocImage[] = [];
  private constructor(
    kind: 'doc' | 'docx',
    source: WordPageSource<NativeWordPage>,
    outline: WordOutlineProvider,
    mode: WordRevisionMode,
  ) {
    this.kind = kind;
    this.source = source;
    this.outline = outline;
    this.mode = mode;
    this.snapshot = { ...source.getSnapshot(), revision: ++this.revision };
    this.stop = source.subscribe(this.refresh);
  }
  static async create(
    preview: OfficeFileViewerPreviewState,
    sessionId: string,
    mode: WordRevisionMode,
    signal?: AbortSignal,
  ): Promise<NativeWordSource> {
    if (signal) throwIfAborted(signal);
    if (preview.previewKind === 'docx') {
      if (preview.mode === 'source') {
        const view = new NativeWordSource(
          'docx',
          preview.source,
          preview.source.outline,
          mode,
        );
        Object.assign(view, {
          measurement: preview.source,
          docxMetadata: () => preview.source.getSummary(),
        });
        return view;
      }
      const document = preview.model.document;
      const source = new DocxWordPageSource({ sessionId, signal });
      source.setMetadata({
        page: document.page,
        preserveSectionPagination: !!document.preserveSectionPagination,
        characterSpacingControl: document.characterSpacingControl,
      });
      try {
        for (const page of document.pages?.length
          ? document.pages
          : [
              {
                id: 'docx-native-page',
                page: document.page,
                blocks: document.blocks,
              },
            ])
          await source.addSourcePage(projectDocxPageContent(page, mode));
        source.finishParsing({
          title: document.title,
          images: document.images,
          bookmarks: document.bookmarks ?? {},
          review: document.review,
          notes: document.notes,
        });
      } catch (error) {
        await source.dispose();
        throw error;
      }
      const view = new NativeWordSource('docx', source, source.outline, mode);
      view.owned = true;
      view.docxMetadata = () => source.getSummary();
      Object.assign(view, { measurement: source });
      return view;
    }
    if (preview.previewKind !== 'doc') throw new Error('Word 视图类型不匹配');
    if (preview.mode === 'source') {
      const view = new NativeWordSource(
        'doc',
        preview.source,
        preview.source.outline,
        mode,
      );
      view.docMetadata = () => preview.source.getSummary();
      return view;
    }
    const document = preview.model.document,
      projected = {
        ...document,
        blocks: projectDocBlocksRevisionMode(document.blocks, mode),
      };
    const pages = paginateDocBlocks(
      projected.blocks,
      document.page,
      document.page.width -
        document.page.marginLeft -
        document.page.marginRight,
    );
    const source = NativeWordSource.docPages(pages, projected);
    const view = new NativeWordSource(
      'doc',
      source,
      createMemoryWordOutlineProvider(document.outline ?? []),
      mode,
    );
    view.rawDoc = document;
    view.calibrationAllowed =
      createWordPerformanceProfile(
        collectWordPerformanceStats(document, {
          estimatedPageCount: pages.length,
        }),
      ).pageMode !== 'windowed';
    view.owned = true;
    view.docMetadata = () => document;
    view.updateDocExtras(pages);
    return view;
  }
  private static docPages(pages: PaginatedDocPage[], document: DocDocument) {
    return createMaterializedWordPageSource(pages, {
      getId: (page) => page.id,
      getEstimatedContentHeight: () => document.page.minHeight,
      getSourceBlockIds: (page) =>
        page.blocks.flatMap((block) => [
          block.id,
          ...(block.sourceBlockId ? [block.sourceBlockId] : []),
          ...docBookmarkMarkerIdsFromBlock(block),
        ]),
      searchBlocks: collectDocSearchBlocks(document.blocks),
    });
  }
  private updateDocExtras(pages: PaginatedDocPage[]) {
    const toc = pages.reduce(
      (last, page, index) =>
        page.blocks.some(
          (block) => block.type === 'paragraph' && block.isTableOfContents,
        )
          ? index
          : last,
      -1,
    );
    this.footerStart = toc >= 0 ? toc + 1 : 1;
    const document = this.rawDoc;
    if (!document) return;
    const ids = new Set<string>();
    if (document.headerImage) ids.add(document.headerImage.id);
    for (const block of document.blocks) {
      const inlines =
        block.type === 'paragraph'
          ? block.inlines ?? []
          : block.type === 'table'
          ? block.rows.flatMap((row) =>
              row.cells.flatMap((cell) => cell.inlines ?? []),
            )
          : block.items.flatMap((item) => item.inlines ?? []);
      for (const inline of inlines)
        if (inline.type === 'image') ids.add(inline.image.id);
    }
    this.unanchoredImages = document.images.filter(
      (image) => !ids.has(image.id),
    );
  }
  get docx() {
    return this.docxMetadata?.();
  }
  get doc() {
    return this.docMetadata?.();
  }
  get searchProvider() {
    return this.source.searchProvider;
  }
  private refresh = () => {
    if (this.closed) return;
    this.snapshot = { ...this.source.getSnapshot(), revision: ++this.revision };
    notify(this.listeners);
  };
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  async getPage(index: number, signal?: AbortSignal) {
    const source = this.source;
    const page = await source.getPage(index, signal);
    if (this.closed || source !== this.source) throw abortError();
    return page;
  }
  ensureRange(start: number, end: number, signal?: AbortSignal) {
    return this.source.ensureRange(start, end, signal);
  }
  retainRange(start: number, end: number) {
    return this.source.retainRange(start, end);
  }
  prioritizeBlock(id: string, signal?: AbortSignal) {
    return this.source.prioritizeBlock(id, signal);
  }
  retry(index: number) {
    this.source.retry(index);
  }
  calibrate(heights: ReadonlyMap<string, number>) {
    if (!this.rawDoc || this.closed) return;
    let changed = false;
    for (const [id, height] of heights)
      if (height > (this.calibrated.get(id) ?? 0) + 0.5) {
        this.calibrated.set(id, height);
        changed = true;
      }
    if (!changed) return;
    const document = {
        ...this.rawDoc,
        blocks: projectDocBlocksRevisionMode(this.rawDoc.blocks, this.mode),
      },
      page = document.page;
    const pages = paginateDocBlocks(
      document.blocks,
      page,
      page.width - page.marginLeft - page.marginRight,
      this.calibrated,
    );
    const previous = this.source;
    this.stop();
    this.source = NativeWordSource.docPages(pages, document);
    this.stop = this.source.subscribe(this.refresh);
    this.generation++;
    this.updateDocExtras(pages);
    this.refresh();
    void previous.dispose();
  }
  async dispose() {
    if (this.closed) return;
    this.closed = true;
    this.stop();
    this.listeners.clear();
    if (this.owned) await this.source.dispose();
  }
}
