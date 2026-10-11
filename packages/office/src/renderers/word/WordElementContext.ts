import type { DocxImageColorChange } from '../../engine/docx/types';
import { enUS } from '../../locale/en-US';
import { zhCN } from '../../locale/zh-CN';
import { createDom, type DomChild } from '../../view/dom/createDom';
import { mountChart, type ChartViewModel } from '../../view/shared/mountChart';
import type { OfficeRenderContext } from '../../view/types';
import { OfficeElementContext } from '../common/OfficeElementContext';
import { createDocBlockRendererView } from './elements/DocBlockRendererView';
import { createDocContentRendererView } from './elements/DocContentRendererView';
import { createDocImageGalleryView } from './elements/DocImageGalleryView';
import { createDocImageLayoutView } from './elements/DocImageLayoutView';
import { createDocInlineContentView } from './elements/DocInlineContentView';
import { createDocListBlockView } from './elements/DocListBlockView';
import { createDocNoteBlockView } from './elements/DocNoteBlockView';
import { createDocPageFrameView } from './elements/DocPageFrameView';
import { createDocParagraphBlockView } from './elements/DocParagraphBlockView';
import { createDocTableBlockView } from './elements/DocTableBlockView';
import { createDocxBlockRendererView } from './elements/DocxBlockRendererView';
import { createDocxChartBlockView } from './elements/DocxChartBlockView';
import { createDocxChartViewView } from './elements/DocxChartViewView';
import { createDocxImageView } from './elements/DocxImageView';
import { createDocxInlineChartView } from './elements/DocxInlineChartView';
import { createDocxInlineContentView } from './elements/DocxInlineContentView';
import { createDocxPageFrameView } from './elements/DocxPageFrameView';
import { createDocxParagraphView } from './elements/DocxParagraphView';
import { createDocxShapeItemRendererView } from './elements/DocxShapeItemRendererView';
import { createDocxShapeView } from './elements/DocxShapeView';
import { createDocxTableBlockView } from './elements/DocxTableBlockView';
import { createOfficeAnnotationMarkerView } from './elements/OfficeAnnotationMarkerView';
import { createWordMarkupCalloutView } from './elements/WordMarkupCalloutView';
import { createWordNoteBlockView } from './elements/WordNoteBlockView';
import { createWordRevisionTextView } from './elements/WordRevisionTextView';
import { createColorChangedImageUrl } from './imageEffects';
/** 页面级原生渲染上下文，所有正文分支直接创建 DOM，测量副本不初始化交互图表。 */
export class WordElementContext extends OfficeElementContext {
  private components = new Map<string, unknown>();
  private plots = new Map<
    string,
    {
      node: HTMLElement;
      view: ReturnType<typeof mountChart>;
      model: ChartViewModel;
    }
  >();
  private plotCounters = new Map<string, number>();
  private seenPlots = new Set<string>();
  private effects = new Map<
    string,
    { url?: string; loading: boolean; error?: Error; generated?: string }
  >();
  private disposed = false;
  constructor(
    context: OfficeRenderContext,
    private readonly redraw: () => void,
    readonly measurement = false,
    public characterSpacing = false,
  ) {
    super(context, () => redraw(), context.document.baseURI);
    this.components.set('DocxBlockRenderer', createDocxBlockRendererView(this));
    this.components.set('DocxParagraph', createDocxParagraphView(this));
    this.components.set('DocxInlineContent', createDocxInlineContentView(this));
    this.components.set('DocxTableBlock', createDocxTableBlockView(this));
    this.components.set('DocxImage', createDocxImageView(this));
    this.components.set('DocxInlineChart', createDocxInlineChartView(this));
    this.components.set('DocxChartBlock', createDocxChartBlockView(this));
    this.components.set('DocxChartView', createDocxChartViewView(this));
    this.components.set('DocxShape', createDocxShapeView(this));
    this.components.set(
      'DocxShapeItemRenderer',
      createDocxShapeItemRendererView(this),
    );
    this.components.set('DocxPageFrame', createDocxPageFrameView(this));
    this.components.set('DocBlockRenderer', createDocBlockRendererView(this));
    this.components.set(
      'DocContentRenderer',
      createDocContentRendererView(this),
    );
    this.components.set('DocParagraphBlock', createDocParagraphBlockView(this));
    this.components.set('DocListBlock', createDocListBlockView(this));
    this.components.set('DocTableBlock', createDocTableBlockView(this));
    this.components.set('DocInlineContent', createDocInlineContentView(this));
    this.components.set('DocImageGallery', createDocImageGalleryView(this));
    this.components.set('DocImageLayout', createDocImageLayoutView(this));
    this.components.set('DocPageFrame', createDocPageFrameView(this));
    this.components.set('DocNoteBlock', createDocNoteBlockView(this));
    this.components.set('WordNoteBlock', createWordNoteBlockView(this));
    this.components.set('WordRevisionText', createWordRevisionTextView(this));
    this.components.set('WordMarkupCallout', createWordMarkupCalloutView(this));
    this.components.set(
      'OfficeAnnotationMarker',
      createOfficeAnnotationMarkerView(this),
    );
  }
  private renderImage: OfficeElementContext['previewableImage'] =
    this.previewableImage;
  previewableImage = (props: Record<string, unknown>): HTMLImageElement => {
    if (!this.measurement) return this.renderImage(props);
    const {
      previewSource,
      previewId,
      previewName,
      previewMimeType,
      previewable,
      ...attributes
    } = props;
    return createDom(this.document, 'img', attributes) as HTMLImageElement;
  };
  get messages() {
    return this.renderContext.locale === 'en-US' ? enUS : zhCN;
  }
  get revisionMode() {
    return this.services.state.getState().revisionMode;
  }
  get annotationRuntime() {
    return {
      options: { showComments: true, showNotes: true },
      state: this.services.annotations.getSnapshot(),
      actions: this.services.annotations.actions,
    };
  }
  component(name: string) {
    return (props: Record<string, unknown>) => {
      const render = this.components.get(name);
      if (typeof render !== 'function')
        throw new Error('缺少原生 Word 渲染器：' + name);
      const owner = this.owner;
      const block = props.block as { id?: string } | undefined;
      if (block?.id) this.owner = block.id;
      try {
        return (render as (props: Record<string, unknown>) => DomChild)(props);
      } finally {
        this.owner = owner;
      }
    };
  }
  render(name: string, props: Record<string, unknown>): Node {
    return createDom(this.document, this.component(name), props);
  }
  begin() {
    this.plotCounters.clear();
    this.seenPlots.clear();
    for (const plot of this.plots.values()) plot.node.remove();
  }
  finish() {
    for (const [key, plot] of this.plots)
      if (!this.seenPlots.has(key)) {
        plot.view.dispose();
        plot.node.remove();
        this.plots.delete(key);
      }
  }
  chart = (props: ChartViewModel) => {
    if (this.measurement)
      return createDom(this.document, 'div', {
        style: {
          width: (props.width * (props.zoom ?? 100)) / 100,
          height: (props.height * (props.zoom ?? 100)) / 100,
        },
      });
    const ordinal = this.plotCounters.get(this.owner) ?? 0;
    this.plotCounters.set(this.owner, ordinal + 1);
    const key = this.owner + ':' + ordinal;
    this.seenPlots.add(key);
    let plot = this.plots.get(key);
    if (!plot) {
      const node = this.document.createElement('div');
      plot = {
        node,
        view: mountChart(node, props, this.renderContext),
        model: props,
      };
      this.plots.set(key, plot);
    } else if (
      plot.model.width !== props.width ||
      plot.model.height !== props.height ||
      plot.model.zoom !== props.zoom ||
      plot.model.chart.series !== props.chart.series ||
      plot.model.chart.snapshotSrc !== props.chart.snapshotSrc
    ) {
      plot.model = props;
      void plot.view.update(props);
    }
    return plot.node;
  };
  colorEffect = (
    url: string | undefined,
    effect: DocxImageColorChange | undefined,
  ) => {
    if (!url || !effect || this.measurement) return { url, loading: false };
    const key = url + JSON.stringify(effect);
    let value = this.effects.get(key);
    if (value) return value;
    value = { url, loading: true };
    this.effects.set(key, value);
    const state = value;
    void createColorChangedImageUrl(url, effect, this.document).then(
      (generated) => {
        if (this.disposed) {
          if (generated)
            (this.document.defaultView?.URL ?? URL).revokeObjectURL(generated);
          return;
        }
        state.url = generated ?? url;
        state.generated = generated;
        state.loading = false;
        this.redraw();
      },
      (error) => {
        if (!this.disposed) {
          state.error =
            error instanceof Error ? error : new Error(String(error));
          state.loading = false;
          this.redraw();
        }
      },
    );
    return value;
  };
  userIcon = () =>
    createDom(
      this.document,
      'svg',
      { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': 'true' },
      createDom(this.document, 'circle', {
        cx: 8,
        cy: 5,
        r: 3,
        fill: 'currentColor',
      }),
      createDom(this.document, 'path', {
        d: 'M2 15a6 6 0 0 1 12 0',
        fill: 'currentColor',
      }),
    );
  disposeWord() {
    if (this.disposed) return;
    this.disposed = true;
    this.dispose();
    for (const plot of this.plots.values()) plot.view.dispose();
    this.plots.clear();
    for (const value of this.effects.values())
      if (value.generated)
        (this.document.defaultView?.URL ?? URL).revokeObjectURL(
          value.generated,
        );
    this.effects.clear();
  }
}
