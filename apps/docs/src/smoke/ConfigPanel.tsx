import { Input, InputNumber, Select, Switch } from 'antd';
import React from 'react';
import { changeView } from './config';
import type { SmokeConfig } from './types';
/** 视图设置保留插件身份，Office 创建选项变化才重建。 */
export function ConfigPanel({
  value,
  onChange,
}: {
  value: SmokeConfig;
  onChange: (v: SmokeConfig) => void;
}) {
  const update = (patch: Partial<SmokeConfig['viewer']>) =>
    onChange(changeView(value, patch));
  return (
    <section className="smoke-controls">
      <label>
        主题
        <Select
          value={value.viewer.theme}
          onChange={(theme) => update({ theme })}
          options={['light', 'dark'].map((value) => ({ value, label: value }))}
        />
      </label>
      <label>
        语言
        <Select
          value={value.viewer.locale}
          onChange={(locale) => update({ locale })}
          options={['zh-CN', 'en-US'].map((value) => ({ value, label: value }))}
        />
      </label>
      <label>
        高度
        <InputNumber
          min={240}
          value={Number(value.viewer.height)}
          onChange={(height) => update({ height: height ?? 640 })}
        />
      </label>
      <label>
        缩放
        <InputNumber
          min={10}
          max={500}
          value={value.viewer.zoom}
          onChange={(zoom) => update({ zoom: zoom ?? 100 })}
        />
      </label>
      <label>
        工具栏
        <Select
          value={value.toolbarMode}
          options={['default', 'custom', 'hidden'].map((value) => ({
            value,
            label: value,
          }))}
          onChange={(toolbarMode) =>
            onChange({
              ...value,
              toolbarMode,
              viewer: { ...value.viewer, toolbar: toolbarMode === 'default' },
            })
          }
        />
      </label>
      <label>
        水印
        <Input
          value={value.viewer.watermark}
          onChange={(e) => update({ watermark: e.target.value })}
        />
      </label>
      <label>
        Worker
        <Select
          value={value.office.worker}
          options={['auto', 'always', 'never'].map((value) => ({
            value,
            label: value,
          }))}
          onChange={(worker) =>
            onChange({ ...value, office: { ...value.office, worker } })
          }
        />
      </label>
      <label>
        媒体
        <Switch
          checked={value.office.media !== false}
          onChange={(enabled) =>
            onChange({
              ...value,
              office: {
                ...value.office,
                media: enabled ? { allowExternal: false } : false,
              },
            })
          }
        />
      </label>
      <label>
        字体回退
        <Input
          value={value.office.fonts?.fallbackFamilies?.join(',')}
          placeholder="Arial"
          onChange={(e) =>
            onChange({
              ...value,
              office: {
                ...value.office,
                fonts: {
                  fallbackFamilies: e.target.value.split(',').filter(Boolean),
                },
              },
            })
          }
        />
      </label>
      <label>
        文件上限（MB）
        <InputNumber
          min={0}
          value={
            value.viewer.resourcePolicy?.maxFileBytes
              ? value.viewer.resourcePolicy.maxFileBytes / 1048576
              : undefined
          }
          onChange={(n) =>
            update({
              resourcePolicy: n ? { maxFileBytes: n * 1048576 } : undefined,
            })
          }
        />
      </label>
    </section>
  );
}
