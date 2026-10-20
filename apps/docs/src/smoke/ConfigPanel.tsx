import type { TextEncoding } from '@fivo/core/text';
import { Input, InputNumber, Select, Switch } from 'antd';
import React from 'react';
import { changeView } from './config';
import type { SmokeConfig, SmokeTarget } from './types';
/** 通用视图设置保留插件身份，各格式创建选项变化时才重建。 */
export function ConfigPanel({
  value,
  onChange,
  target,
  format,
}: {
  value: SmokeConfig;
  onChange: (v: SmokeConfig) => void;
  target: SmokeTarget;
  format?: string;
}) {
  const update = (patch: Partial<SmokeConfig['viewer']>) =>
    onChange(changeView(value, patch));
  const textual = ['text', 'json', 'markdown', 'csv', 'xml', 'code'].includes(
    format ?? '',
  )
    ? (format as 'text' | 'json' | 'markdown' | 'csv' | 'xml' | 'code')
    : undefined;
  const updateFormat = <
    K extends 'text' | 'json' | 'markdown' | 'csv' | 'xml' | 'code',
  >(
    key: K,
    patch: Partial<SmokeConfig[K]>,
  ) => onChange({ ...value, [key]: { ...value[key], ...patch } });
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
        <Input
          aria-label="预览高度"
          placeholder="640、80vh 或 100%"
          value={String(value.viewer.height ?? '')}
          onChange={(event) => {
            const height = event.target.value.trim();
            update({
              height: /^\d+$/.test(height)
                ? Number(height)
                : height || undefined,
            });
          }}
        />
      </label>
      <label>
        缩放
        <InputNumber
          min={10}
          max={500}
          disabled={target === 'probe'}
          placeholder="默认比例"
          value={value.viewer.zoom ?? null}
          onChange={(zoom) => update({ zoom: zoom ?? undefined })}
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
          disabled={target === 'probe'}
          onChange={(e) => update({ watermark: e.target.value })}
        />
      </label>
      <label hidden={format === 'image' || format === 'pdf'}>
        Worker
        <Select<'auto' | 'always' | 'never'>
          value={textual ? value[textual].worker : value.office.worker}
          disabled={target === 'probe'}
          options={['auto', 'always', 'never'].map((value) => ({
            value,
            label: value,
          }))}
          onChange={(worker) =>
            textual
              ? updateFormat(textual, { worker })
              : onChange({ ...value, office: { ...value.office, worker } })
          }
        />
      </label>
      {textual && (
        <label>
          编码
          <Select<TextEncoding>
            value={value[textual].encoding ?? 'auto'}
            options={[
              'auto',
              'utf-8',
              'utf-16le',
              'utf-16be',
              'gbk',
              'gb18030',
            ].map((value) => ({ value, label: value.toUpperCase() }))}
            onChange={(encoding) => updateFormat(textual, { encoding })}
          />
        </label>
      )}
      {format === 'text' && (
        <label>
          自动换行
          <Switch
            checked={value.text.wrap !== false}
            onChange={(wrap) => updateFormat('text', { wrap })}
          />
        </label>
      )}
      {format === 'json' && (
        <label>
          初始视图
          <Select<'tree' | 'source'>
            value={value.json.initialMode ?? 'tree'}
            options={[
              { value: 'tree', label: '双栏（窄屏为结构）' },
              { value: 'source', label: '原文' },
            ]}
            onChange={(initialMode) => updateFormat('json', { initialMode })}
          />
        </label>
      )}
      {format === 'markdown' && (
        <>
          <label>
            初始视图
            <Select<'reading' | 'source'>
              value={value.markdown.initialMode ?? 'reading'}
              options={[
                { value: 'reading', label: '阅读' },
                { value: 'source', label: '原文' },
              ]}
              onChange={(initialMode) =>
                updateFormat('markdown', { initialMode })
              }
            />
          </label>
          <label>
            代码高亮
            <Switch
              checked={value.markdown.highlight !== false}
              onChange={(highlight) => updateFormat('markdown', { highlight })}
            />
          </label>
        </>
      )}
      {!textual && format !== 'image' && format !== 'pdf' && (
        <>
          <label>
            媒体
            <Switch
              checked={value.office.media !== false}
              disabled={target === 'probe'}
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
              disabled={target === 'probe'}
              placeholder="Arial"
              onChange={(e) =>
                onChange({
                  ...value,
                  office: {
                    ...value.office,
                    fonts: {
                      fallbackFamilies: e.target.value
                        .split(',')
                        .filter(Boolean),
                    },
                  },
                })
              }
            />
          </label>
        </>
      )}
      {format === 'pdf' && (
        <label>
          页面缓存（MB）
          <InputNumber
            min={1}
            value={(value.pdf.canvasCacheBytes ?? 96 * 1048576) / 1048576}
            onChange={(n) =>
              onChange({
                ...value,
                pdf: {
                  ...value.pdf,
                  canvasCacheBytes: n ? n * 1048576 : undefined,
                },
              })
            }
          />
        </label>
      )}
      {format === 'image' && (
        <label>
          图片像素上限
          <InputNumber
            min={1}
            value={value.image.maxDecodedPixels}
            onChange={(n) =>
              onChange({
                ...value,
                image: { ...value.image, maxDecodedPixels: n ?? undefined },
              })
            }
          />
        </label>
      )}
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
