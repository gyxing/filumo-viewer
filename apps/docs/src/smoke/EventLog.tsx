import { Button } from 'antd';
import React from 'react';
import type { LogEntry } from './types';
/** 日志最多 200 条且使用文本渲染，文档字符串不会被解释为 HTML。 */
export function EventLog({
  items,
  clear,
}: {
  items: LogEntry[];
  clear: () => void;
}) {
  return (
    <section>
      <h2>事件日志</h2>
      <Button onClick={clear}>清空日志</Button>
      <pre aria-label="事件日志">
        {items.map((item) => item.kind + ': ' + item.message).join('\n')}
      </pre>
    </section>
  );
}
