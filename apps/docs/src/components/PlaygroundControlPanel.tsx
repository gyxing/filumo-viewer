import { Input, InputNumber, Select, Switch } from 'antd';
import React from 'react';
import type { PlaygroundConfig } from './playground-config';
import type { PlaygroundContent } from './playground-content';

/** 分组配置只暴露当前 Filumo 已支持的参数，不复活旧版专属属性。 */
export function PlaygroundControlPanel({
  config,
  content,
  onChange,
  onReset,
}: {
  config: PlaygroundConfig;
  content: PlaygroundContent;
  onChange(next: PlaygroundConfig): void;
  onReset(): void;
}) {
  const setView = (next: Partial<PlaygroundConfig['viewer']>) =>
    onChange({ ...config, viewer: { ...config.viewer, ...next } });
  return (
    <aside
      className="filumo-playground-controls"
      aria-labelledby="playground-controls-title"
    >
      <div className="filumo-playground-card-heading">
        <h2 id="playground-controls-title">{content.controls}</h2>
        <button type="button" onClick={onReset}>
          {content.reset}
        </button>
      </div>
      <fieldset>
        <legend>{content.appearance}</legend>
        <label className="filumo-playground-field">
          <span>{content.theme}</span>
          <Select
            aria-label={content.theme}
            value={config.viewer.theme}
            options={[
              { value: 'light', label: content.light },
              { value: 'dark', label: content.dark },
            ]}
            onChange={(theme) => setView({ theme })}
          />
        </label>
        <label className="filumo-playground-field">
          <span>{content.height}</span>
          <InputNumber
            aria-label={content.height}
            min={240}
            max={1200}
            step={40}
            value={Number(config.viewer.height)}
            addonAfter="px"
            onChange={(height) => setView({ height: height ?? 640 })}
          />
        </label>
        <label className="filumo-playground-field">
          <span>{content.language}</span>
          <Select
            aria-label={content.language}
            value={config.viewer.locale}
            options={[
              { value: 'zh-CN', label: '简体中文' },
              { value: 'en-US', label: 'English' },
            ]}
            onChange={(locale) => setView({ locale })}
          />
        </label>
      </fieldset>
      <fieldset>
        <legend>{content.viewing}</legend>
        <label className="filumo-playground-field">
          <span>{content.zoom}</span>
          <InputNumber
            aria-label={content.zoom}
            min={25}
            max={200}
            step={25}
            value={config.viewer.zoom}
            addonAfter="%"
            onChange={(zoom) => setView({ zoom: zoom ?? 100 })}
          />
        </label>
        <label className="filumo-playground-field">
          <span>{content.toolbar}</span>
          <Select
            aria-label={content.toolbar}
            value={config.viewer.toolbar ? 'default' : 'hidden'}
            options={[
              { value: 'default', label: content.toolbarDefault },
              { value: 'hidden', label: content.toolbarHidden },
            ]}
            onChange={(mode) => setView({ toolbar: mode === 'default' })}
          />
        </label>
        <label className="filumo-playground-toggle">
          <Switch
            size="small"
            aria-label={content.watermark}
            checked={Boolean(config.viewer.watermark)}
            onChange={(enabled) =>
              setView({ watermark: enabled ? 'Filumo' : undefined })
            }
          />
          <span>{content.watermark}</span>
        </label>
        {config.viewer.watermark !== undefined && (
          <Input
            aria-label={content.watermarkText}
            maxLength={80}
            value={config.viewer.watermark}
            placeholder="Filumo"
            onChange={(event) => setView({ watermark: event.target.value })}
          />
        )}
      </fieldset>
      <fieldset>
        <legend>{content.resources}</legend>
        <label className="filumo-playground-field">
          <span>{content.worker}</span>
          <Select
            aria-label={content.worker}
            value={config.office.worker}
            options={[
              { value: 'auto', label: content.workerAuto },
              { value: 'always', label: content.workerAlways },
              { value: 'never', label: content.workerNever },
            ]}
            onChange={(worker) =>
              onChange({ ...config, office: { ...config.office, worker } })
            }
          />
        </label>
        <label className="filumo-playground-toggle">
          <Switch
            size="small"
            aria-label={content.media}
            checked={config.office.media !== false}
            onChange={(enabled) =>
              onChange({
                ...config,
                office: { ...config.office, media: enabled ? {} : false },
              })
            }
          />
          <span>{content.media}</span>
        </label>
        <p className="filumo-playground-help">{content.resourceHint}</p>
      </fieldset>
    </aside>
  );
}
