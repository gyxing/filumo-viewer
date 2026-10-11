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
              ],
            },
          ],
          merges: [{ startRow: 3, endRow: 4, startColumn: 1, endColumn: 2 }],
          images: [],
          charts: [],
          pane: { frozenRows: 2, frozenColumns: 1, state: 'frozen' as const },
        },
      ],
    };
    const source = createMaterializedSpreadsheetSource(workbook);
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
        onError: (error) => {
          throw error;
        },
        setCapabilities: () => {},
      }),
      context = {
        container,
        document,
        services,
        signal: session.signal,
        onError: (error) => {
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
