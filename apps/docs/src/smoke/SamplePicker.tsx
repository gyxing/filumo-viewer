import { Alert, Select } from 'antd';
import React, { useEffect, useState } from 'react';
import { docsPath } from '../site-path';
import type { Sample } from './types';
/** 样本清单由开发服务器提供，不把私有名称打包进应用。 */
export function SamplePicker({
  onSample,
  onFile,
}: {
  onSample: (s: Sample) => void;
  onFile: (f?: File) => void;
}) {
  const [samples, setSamples] = useState<Sample[]>([]),
    [message, setMessage] = useState('读取样本列表');
  useEffect(() => {
    const controller = new AbortController();
    fetch(docsPath('__fivo_smoke/samples'), {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw Error('烟测接口未启用');
        return r.json();
      })
      .then((data) => {
        setSamples(data.samples);
        setMessage(
          data.configured
            ? '本机样本已配置，文件只在浏览器解析'
            : data.diagnostics.join('；'),
        );
      })
      .catch((e) => {
        if (!controller.signal.aborted) setMessage(e.message);
      });
    return () => controller.abort();
  }, []);
  return (
    <section>
      <Alert message={message} type="info" />
      <div className="smoke-controls">
        <Select
          aria-label="选择烟测样本"
          placeholder="选择样本"
          showSearch
          optionFilterProp="label"
          options={samples.map((s) => ({
            value: s.id,
            label: s.label + ' (' + s.extension.toUpperCase() + ')',
          }))}
          onChange={(id) => {
            const sample = samples.find((s) => s.id === id);
            if (sample) onSample(sample);
          }}
        />
        <label>
          本机文件{' '}
          <input
            aria-label="选择本机文件"
            type="file"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>
      </div>
    </section>
  );
}
