import { archive } from '@filumo/archive';
import { code } from '@filumo/code';
import { Alert, Button, Empty, Input, Spin } from 'antd';
import React, { useEffect, useState } from 'react';
import { docsPath } from '../site-path';
import type { Sample } from './types';

// 按实际解析族展示本机和公开样本，WPS 随 Word 分组。
const groups = [
  { name: 'Word', formats: ['doc', 'docx', 'wps'] },
  { name: 'Excel', formats: ['xls', 'xlsx'] },
  { name: 'PowerPoint', formats: ['ppt', 'pptx'] },
  {
    name: '纯文本',
    formats: ['txt', 'log', 'ini', 'conf', 'cfg', 'properties', 'out'],
  },
  { name: 'JSON', formats: ['json', 'jsonc', 'jsonl', 'ndjson'] },
  { name: 'CSV / TSV', formats: ['csv', 'tsv'] },
  { name: 'XML', formats: ['xml'] },
  {
    name: 'Code',
    formats: code().document.extensions.map((extension) => extension.slice(1)),
  },
  { name: 'Markdown', formats: ['md', 'markdown'] },
  {
    name: '图片',
    formats: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'],
  },
  { name: 'PDF', formats: ['pdf'] },
  {
    name: '压缩包',
    formats: archive().document.extensions.map((extension) =>
      extension.slice(1),
    ),
  },
];

/** 样本只从开发接口读取，工作台源码不包含真实文件名或本机路径。 */
export function SamplePicker({
  selectedId,
  onSample,
  onFile,
  accept,
}: {
  selectedId?: string;
  onSample: (sample: Sample) => void;
  onFile: (file?: File) => void;
  accept: string;
}) {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    fetch(docsPath('__filumo_smoke/samples'), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw Error('样本接口不可用，请通过 pnpm smoke 启动');
        return response.json();
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setSamples(data.samples);
        setMessage(
          data.configured
            ? '本机样本已配置，文件只在浏览器解析'
            : data.diagnostics.join('；'),
        );
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setError(true);
          setMessage(cause instanceof Error ? cause.message : String(cause));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);
  const match = query.trim().toLowerCase();
  const visible = samples.filter((sample) =>
    (sample.label + ' ' + sample.extension).toLowerCase().includes(match),
  );
  return (
    <aside className="smoke-samples" aria-label="烟测样本列表">
      <header className="smoke-section-heading">
        <h2>示例文件</h2>
        <span>
          {visible.length} / {samples.length}
        </span>
      </header>
      <Input
        aria-label="搜索烟测样本"
        placeholder="搜索名称或格式"
        allowClear
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <label className="smoke-file-picker">
        选择本机文件
        <input
          aria-label="选择本机文件"
          type="file"
          accept={accept}
          onChange={(event) => {
            onFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </label>
      {message && <Alert message={message} type={error ? 'error' : 'info'} />}
      {error && (
        <Button onClick={() => setRevision((value) => value + 1)}>
          重试读取样本
        </Button>
      )}
      <div className="smoke-sample-groups">
        {loading && (
          <Spin tip="读取样本列表">
            <div className="smoke-sample-loading" />
          </Spin>
        )}
        {!loading && !visible.length && (
          <Empty
            description="没有匹配的样本"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        )}
        {groups.map((group) => {
          const items = visible.filter((sample) =>
            group.formats.includes(sample.format),
          );
          if (!items.length) return null;
          return (
            <section
              key={group.name}
              className="smoke-sample-group"
              aria-label={group.name + ' 样本'}
            >
              <h3 aria-label={group.name}>
                {group.name} <span>{items.length}</span>
              </h3>
              {items.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  className="smoke-sample"
                  aria-label={
                    sample.label + ' (' + sample.extension.toUpperCase() + ')'
                  }
                  aria-pressed={selectedId === sample.id}
                  onClick={() => onSample(sample)}
                >
                  <strong title={sample.label}>{sample.label}</strong>
                  <span>
                    {sample.extension.toUpperCase()} ·{' '}
                    {sample.bytes >= 1048576
                      ? (sample.bytes / 1048576).toFixed(1) + ' MB'
                      : Math.max(1, Math.ceil(sample.bytes / 1024)) + ' KB'}
                    {selectedId === sample.id ? ' · 已选择' : ''}
                  </span>
                </button>
              ))}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
