import { createSession, normalizeSource } from '../../../packages/core/src';
import { createMaterializedSpreadsheetSource } from '../../../packages/office/src/engine/spreadsheet/createMaterializedSpreadsheetSource';
import { SpreadsheetGrid } from '../../../packages/office/src/renderers/spreadsheet/SpreadsheetGrid';
import '../../../packages/office/src/renderers/spreadsheet/styles/document.less';
import { createOfficeInteractions } from '../../../packages/office/src/runtime/createOfficeInteractions';
import { createOfficeViewServices } from '../../../packages/office/src/services/createOfficeViewServices';
import '../../../packages/office/src/styles/office.less';
const run = document.getElementById('run')!;
run.onclick = async () => {
  const output = document.getElementById('result')!,
    container = document.getElementById('preview')!,
    lines: string[] = [];
  const check = (ok: boolean, label: string) => {
    if (!ok) throw Error(label);
    lines.push('通过：' + label);
    output.textContent = lines.join('\n');
  };
  let cleanup: (() => Promise<void>) | undefined;
  try {
    const workbook = {
      sheets: [
        {
          id: 'sheet',
          name: 'Sparse',
          path: 'sheet',
          rowCount: 10000,
          columnCount: 500,
          defaultRowHeight: 20,
          defaultColumnWidth: 64,
          columns: [
            { index: 1, label: 'A', width: 100 },
            { index: 2, label: 'B', width: 100 },
          ],
          rows: [
            {
              index: 1,
              height: 24,
              cells: [
                { ref: 'A1', rowIndex: 1, columnIndex: 1, value: '冻结角落' },
              ],
            },
            {
              index: 3,
              height: 20,
              cells: [
                {
                  ref: 'A3',
                  rowIndex: 3,
                  columnIndex: 1,
                  value: '合并区域',
                  style: { wrapText: true },
                },
              ],
            },
            {
              index: 20,
              height: 20,
              cells: [
                {
                  ref: 'B20',
                  rowIndex: 20,
                  columnIndex: 2,
                  value: '阅读行高 '.repeat(35),
                },
              ],
            },
            {
              index: 9999,
              height: 20,
              cells: [
                {
                  ref: 'OJ9999',
                  rowIndex: 9999,
                  columnIndex: 400,
                  value: '稀疏尾部',
                },
                {
                  ref: 'SF9999',
                  rowIndex: 9999,
                  columnIndex: 500,
                  value: '最右侧内容',
                },
              ],
            },
          ],
          merges: [
            {
              ref: 'A1:Z1',
              startRow: 1,
              endRow: 1,
              startColumn: 1,
              endColumn: 26,
            },
            {
              ref: 'A3:B4',
              startRow: 3,
              endRow: 4,
              startColumn: 1,
              endColumn: 2,
            },
          ],
          images: [],
          charts: [],
          pane: { frozenRows: 2, frozenColumns: 1, state: 'frozen' as const },
        },
      ],
    };
    const source = createMaterializedSpreadsheetSource(workbook);
    let rangeReads = 0;
    const readRange = source.getRange.bind(source);
    // 只记录真实数据源的读取次数，防止列宽覆盖触发重复读取相同窗口。
    source.getRange = (...args) => {
      rangeReads++;
      return readRange(...args);
    };
    await source.ensureSheet('sheet');
    const file = new File([''], 'sparse.xlsx'),
      input = await normalizeSource(file),
      port = createOfficeInteractions('xlsx');
    const session = createSession({
      signal: new AbortController().signal,
      source: input,
      format: 'xlsx',
      data: {
        file,
        interactions: port,
        preview: {
          previewKind: 'xlsx',
          mode: 'materialized',
          sessionId: 'sparse',
          model: { kind: 'xlsx', workbook },
        },
      },
    });
    const services = createOfficeViewServices({
        container,
        session,
        options: {},
        onError: (error: unknown) => {
          throw error;
        },
        setCapabilities: () => {},
      }),
      context = {
        container,
        document,
        services,
        signal: session.signal,
        onError: (error: unknown) => {
          throw error;
        },
      };
    const heights = new Map<number, number>();
    const grid = new SpreadsheetGrid(
      source,
      'sheet',
      source.getSheetLayout('sheet'),
      context,
      100,
      'source',
      heights,
    );
    container.append(grid.element);
    cleanup = async () => {
      grid.dispose();
      await services.dispose();
      await session.dispose();
      await source.dispose();
    };
    for (
      let i = 0;
      i < 100 && !container.textContent?.includes('合并区域');
      i++
    )
      await new Promise((r) => setTimeout(r, 20));
    check(
      container.textContent?.includes('合并区域') ?? false,
      '合并单元格锚点可见',
    );
    check(
      container.querySelectorAll('[data-office-spreadsheet-cell]').length <
        10000,
      '一万行工作表使用有界 DOM 窗口',
    );
    const readsBeforeResize = rangeReads;
    const handle = grid.element.querySelector<HTMLElement>(
      '[data-resize-column="0"]',
    )!;
    handle.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        bubbles: true,
        cancelable: true,
      }),
    );
    for (let i = 0; i < 4; i++)
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    check(rangeReads === readsBeforeResize, '列宽变化复用已覆盖的数据窗口');
    grid.resetColumnWidths();
    for (let i = 0; i < 4; i++)
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    check(rangeReads === readsBeforeResize, '复位列宽不重复读取已缓存的源数据');
    for (let i = 0; i < 70; i++)
      grid.element
        .querySelector<HTMLElement>('[data-resize-column="0"]')!
        .dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'ArrowRight',
            bubbles: true,
            cancelable: true,
          }),
        );
    for (let i = 0; i < 4; i++)
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    check(
      grid.element.querySelector('[data-office-frozen-pane="columns"]')!
        .childElementCount === 0,
      '冻结列过宽时暂停横向冻结，正文不会被固定层全部覆盖',
    );
    grid.resetColumnWidths();
    for (let i = 0; i < 4; i++)
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    check(
      grid.element.querySelector('[data-office-frozen-pane="columns"]')!
        .childElementCount > 0,
      '恢复列宽后自动恢复源文档的冻结列',
    );
    grid.scrollToCell(9999, 400);
    for (
      let i = 0;
      i < 100 && !container.textContent?.includes('稀疏尾部');
      i++
    )
      await new Promise((r) => setTimeout(r, 20));
    check(
      container.textContent?.includes('稀疏尾部') ?? false,
      '远端稀疏单元格可导航',
    );
    check(
      container.textContent?.includes('冻结角落') ?? false,
      '冻结角落在远端窗口保持可见',
    );
    grid.scrollToCell(9999, 500);
    for (
      let i = 0;
      i < 100 && !container.textContent?.includes('最右侧内容');
      i++
    )
      await new Promise((resolve) => setTimeout(resolve, 20));
    for (let i = 0; i < 4; i++)
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    const canvas = grid.element.querySelector<HTMLElement>(
      '.office-file-xlsx-virtual-grid__canvas',
    )!;
    const padding = getComputedStyle(grid.element);
    const expectedWidth =
      canvas.getBoundingClientRect().width +
      parseFloat(padding.paddingLeft) +
      parseFloat(padding.paddingRight);
    check(
      Math.abs(grid.element.scrollWidth - expectedWidth) <= 2,
      '跨多列的冻结合并单元格不会扩大横向滚动上限',
    );
    check(
      container.textContent?.includes('最右侧内容') ?? false,
      '横向导航能到达最后一列',
    );
    const frozenCell = grid.element
      .querySelector<HTMLElement>(
        '[data-office-frozen-pane="corner"] [data-grid-row="0"][data-grid-column="0"]',
      )!
      .getBoundingClientRect();
    const columnHeader = grid.element
      .querySelector<HTMLElement>('[data-grid-header-column="0"]')!
      .getBoundingClientRect();
    const rowHeader = grid.element
      .querySelector<HTMLElement>('[data-grid-header-key="row:1"]')!
      .getBoundingClientRect();
    check(
      Math.abs(columnHeader.bottom - frozenCell.top) <= 1,
      '纵向滚动后冻结首行贴合列表头，不露出滚动正文',
    );
    check(
      Math.abs(rowHeader.right - frozenCell.left) <= 1,
      '横向滚动后冻结首列贴合行号栏，不残留内边距接缝',
    );
    const beforeZoom = grid.getState().scroll!;
    for (const zoom of [150, 100]) {
      grid.update(source.getSheetLayout('sheet'), zoom, 'source');
      for (let i = 0; i < 4; i++)
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
      const afterZoom = grid.getState().scroll!;
      check(
        afterZoom.row === beforeZoom.row &&
          afterZoom.column === beforeZoom.column &&
          Math.abs(afterZoom.rowOffset - beforeZoom.rowOffset) <= 1 &&
          Math.abs(afterZoom.columnOffset - beforeZoom.columnOffset) <= 1,
        '切换到 ' + zoom + '% 后保持逻辑行列和格内阅读位置',
      );
    }
    grid.scrollToCell(20, 2);
    grid.update(source.getSheetLayout('sheet'), 100, 'reading');
    for (let i = 0; i < 100 && !heights.get(20); i++)
      await new Promise((r) => setTimeout(r, 20));
    check((heights.get(20) ?? 0) > 20, '阅读模式按内容增加行高');
    await cleanup();
    check(
      !container.querySelector('.office-file-xlsx-virtual-grid'),
      '窗口和资源释放',
    );
    document.body.dataset.verification = 'passed';
    output.textContent = lines.join('\n') + '\n全部通过';
  } catch (error) {
    document.body.dataset.verification = 'failed';
    output.textContent = lines.join('\n') + '\n失败：' + String(error);
    await cleanup?.();
  }
};
