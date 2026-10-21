import { createSession, normalizeSource } from '../../../packages/core/src';
import type { SlideModel } from '../../../packages/office/src/engine/presentation/types';
import { SlideScene } from '../../../packages/office/src/renderers/presentation/SlideScene';
import '../../../packages/office/src/renderers/presentation/styles/document.less';
import { createOfficeInteractions } from '../../../packages/office/src/runtime/createOfficeInteractions';
import { createOfficeViewServices } from '../../../packages/office/src/services/createOfficeViewServices';
import '../../../packages/office/src/styles/office.less';
const run = document.getElementById('run')!;
run.onclick = async () => {
  const out = document.getElementById('result')!,
    lines: string[] = [];
  const check = (ok: boolean, label: string) => {
    if (!ok) throw Error(label);
    lines.push('通过：' + label);
    out.textContent = lines.join('\n');
  };
  let stop: (() => Promise<void>) | undefined;
  try {
    const stage = document.getElementById('preview')!,
      native = document.createElement('div');
    native.style.cssText =
      'position:relative;width:960px;height:540px;overflow:hidden;';
    stage.append(native);
    const slide: SlideModel = {
      id: 'parity',
      index: 0,
      width: 960,
      height: 540,
      background: { fill: '#ffffff' },
      elements: [
        {
          id: 'text',
          type: 'text',
          x: 30,
          y: 20,
          width: 420,
          height: 130,
          fill: {
            type: 'linear',
            angle: 45,
            stops: [
              { offset: 0, color: '#f0f8ff' },
              { offset: 1, color: '#ffffff' },
            ],
          },
          shape: 'roundRect',
          boxStyle: { fontSize: 22, color: '#123456' },
          paragraphs: [
            {
              runs: [
                { text: 'Filumo 原生文本 ', style: { bold: true } },
                { text: '第二段', style: { italic: true, underline: true } },
              ],
              bullet: { char: '•' },
              style: { align: 'left' },
            },
            { runs: [{ text: '段落保留' }], style: { align: 'center' } },
          ],
        },
        {
          id: 'shape',
          type: 'shape',
          x: 480,
          y: 20,
          width: 120,
          height: 80,
          shape: 'rect',
          fill: '#ff0000',
          stroke: '#123456',
          strokeWidth: 2,
          rotate: 15,
        },
        {
          id: 'vector',
          type: 'shape',
          x: 620,
          y: 20,
          width: 130,
          height: 80,
          path: 'M0 0 L130 0 L65 80 Z',
          viewBox: '0 0 130 80',
          fill: '#22bb55',
          stroke: '#000000',
        },
        {
          id: 'table',
          type: 'table',
          x: 30,
          y: 180,
          width: 420,
          height: 100,
          columnWidths: [210, 210],
          rowHeights: [50, 50],
          rows: [
            [{ text: 'A1', backgroundColor: '#eeeeff' }, { text: 'B1' }],
            [{ text: 'A2' }, { text: 'B2' }],
          ],
        },
        {
          id: 'image',
          type: 'image',
          x: 500,
          y: 180,
          width: 100,
          height: 100,
          src: {
            kind: 'lazy',
            id: 'image',
            mimeType: 'image/svg+xml',
            size: 100,
            load: async () => {
              await new Promise((r) => setTimeout(r, 20));
              return new Blob(
                [
                  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="blue"/></svg>',
                ],
                { type: 'image/svg+xml' },
              );
            },
          },
          crop: { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 },
          rotate: 10,
          alt: 'crop',
        },
        {
          id: 'unsupported',
          type: 'unsupported',
          x: 30,
          y: 320,
          width: 200,
          height: 60,
          reason: '明确的原生占位',
        },
      ],
    };
    const file = new File([''], 'fixture.pptx'),
      source = await normalizeSource(file),
      interactions = createOfficeInteractions('pptx');
    const session = createSession({
      id: 'parity',
      signal: new AbortController().signal,
      source,
      format: 'pptx',
      data: {
        file,
        interactions,
        preview: {
          previewKind: 'pptx',
          sessionId: 'parity',
          mode: 'materialized',
          model: {
            kind: 'pptx',
            document: {
              width: 960,
              height: 540,
              theme: { colorScheme: {}, fontScheme: {} },
              slides: [slide],
            },
          },
        },
      },
    });
    const services = createOfficeViewServices({
      container: stage,
      session,
      options: {},
      onError: (error) => {
        throw error;
      },
      setCapabilities: () => {},
    });
    const context = {
      container: stage,
      document,
      services,
      signal: session.signal,
      onError: (error) => {
        throw error;
      },
    };
    const scene = new SlideScene(slide, context, {
      zoom: 100,
      interactive: true,
      slideIndex: 0,
    });
    native.append(scene.element);
    stop = async () => {
      scene.dispose();
      await services.dispose();
      await session.dispose();
      stage.replaceChildren();
    };
    for (
      let i = 0;
      i < 100 && !native.querySelector('img')?.getAttribute('src');
      i++
    )
      await new Promise((r) => setTimeout(r, 20));
    await services.layout.flush();
    check(
      [
        'Filumo 原生文本',
        '第二段',
        '段落保留',
        'A1',
        'B2',
        '明确的原生占位',
      ].every((text) => native.textContent?.includes(text)),
      '固定元素文本完整',
    );
    for (const id of ['text', 'shape', 'image', 'table']) {
      const model = slide.elements.find((el) => el.id === id)!;
      const el = native.querySelector<HTMLElement>(
        '[data-office-presentation-element-id="' + id + '"]',
      )!;
      check(!!el, id + '存在');
      const rect = el.getBoundingClientRect(),
        host = native.getBoundingClientRect();
      const angle =
        (('rotate' in model ? model.rotate ?? 0 : 0) * Math.PI) / 180;
      // 此夹具的普通形状使用 content-box，旋转包围盒必须计入明确的描边宽度。
      const border =
        model.type === 'shape' && model.stroke && !model.path
          ? 2 * (model.strokeWidth ?? 1)
          : 0;
      const boxWidth = model.width + border,
        boxHeight = model.height + border;
      const width =
        Math.abs(boxWidth * Math.cos(angle)) +
        Math.abs(boxHeight * Math.sin(angle));
      const height =
        Math.abs(boxHeight * Math.cos(angle)) +
        Math.abs(boxWidth * Math.sin(angle));
      if (Math.abs(rect.width - width) >= 0.2)
        lines.push(
          JSON.stringify({
            id,
            actual: {
              x: rect.left - host.left,
              y: rect.top - host.top,
              w: rect.width,
              h: rect.height,
            },
            expected: {
              x: model.x + (model.width - width) / 2,
              y: model.y + (model.height - height) / 2,
              w: width,
              h: height,
            },
            style: el.getAttribute('style'),
          }),
        );
      check(
        Math.abs(rect.width - width) < 0.2 &&
          Math.abs(rect.height - height) < 0.2 &&
          Math.abs(rect.left - host.left - (model.x + (boxWidth - width) / 2)) <
            0.2 &&
          Math.abs(rect.top - host.top - (model.y + (boxHeight - height) / 2)) <
            0.2,
        id + '固定模型几何一致',
      );
    }
    check(
      native.querySelector('svg path[d="M0 0 L130 0 L65 80 Z"]') !== null,
      '矢量路径保持',
    );
    services.search.actions.registerProvider({
      kind: 'presentation',
      search: async (_query, emit) =>
        emit({
          items: [
            {
              id: 'hit',
              matchText: 'Filumo',
              previewText: 'Filumo',
              target: {
                kind: 'presentation',
                slideIndex: 0,
                elementId: 'text',
                startOffset: 0,
                endOffset: 4,
                hidden: false,
              },
            },
          ],
          scanned: 1,
          total: 1,
          complete: true,
        }),
    });
    await interactions.execute({ type: 'search', query: 'Filumo', open: true });
    await new Promise((r) => setTimeout(r, 150));
    scene.refreshText();
    await services.layout.flush();
    check(native.querySelectorAll('mark').length > 0, '原生局部更新和搜索高亮');
    await stop();
    check(stage.childNodes.length === 0, '对照视图和服务完整释放');
    document.body.dataset.verification = 'passed';
    out.textContent = lines.join('\n') + '\n全部通过';
  } catch (error) {
    out.textContent = lines.join('\n') + '\n失败：' + String(error);
    document.body.dataset.verification = 'failed';
    await stop?.();
  }
};
