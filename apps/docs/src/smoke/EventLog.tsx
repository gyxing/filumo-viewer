import { Button, Empty } from 'antd';
import React, { useState } from 'react';
import type { LogEntry } from './types';

// 事件类型通过中文标签和颜色共同表达，不能只依赖颜色判断结果。
const labels: Record<string, string> = {
  source: '文件',
  config: '参数',
  target: '对象',
  progress: '进度',
  ready: '就绪',
  state: '状态',
  warning: '警告',
  error: '错误',
  hyperlink: '链接',
  dispose: '销毁',
  action: '操作',
};

/** 展示有界的带时间日志，收起不会清空诊断信息。 */
export function EventLog({
  items,
  clear,
}: {
  items: LogEntry[];
  clear: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <section className="smoke-logs">
      <header className="smoke-section-heading">
        <h2>
          事件日志 <span>{items.length} / 200</span>
        </h2>
        <div className="smoke-log-actions">
          <Button size="small" onClick={() => setExpanded(!expanded)}>
            {expanded ? '收起事件日志' : '展开事件日志'}
          </Button>
          <Button size="small" disabled={!items.length} onClick={clear}>
            清空日志
          </Button>
        </div>
      </header>
      {expanded && (
        <>
          {!items.length && (
            <Empty
              description="暂无事件，选择样本或调整参数后查看"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}
          <ol className="smoke-log-list" aria-label="事件日志">
            {items.map((item) => (
              <li key={item.id}>
                <time dateTime={item.time}>
                  {new Date(item.time).toLocaleTimeString('zh-CN', {
                    hour12: false,
                  })}
                </time>
                <span className={'smoke-log-kind smoke-log-kind-' + item.kind}>
                  {labels[item.kind] ?? item.kind}
                </span>
                <span>{item.message}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
