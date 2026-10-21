import type { ViewerCapabilities } from '@filumo/dom';
import { Button, Input, InputNumber, Select } from 'antd';
import React from 'react';
/** 完全根据当前能力生成控件，不为缺省格式制造页数。 */
export function CapabilityPanel({
  value,
  onError,
}: {
  value: ViewerCapabilities;
  onError: (e: unknown) => void;
}) {
  const perform = (action: () => unknown) => {
    Promise.resolve().then(action).catch(onError);
  };
  return (
    <section className="smoke-controls">
      {value.zoom && (
        <label>
          当前缩放
          <InputNumber
            aria-label="当前缩放"
            min={value.zoom.min}
            max={value.zoom.max}
            step={value.zoom.step}
            value={value.zoom.value}
            onChange={(zoom) => {
              if (zoom !== null) perform(() => value.zoom?.set(zoom));
            }}
          />
        </label>
      )}
      {value.navigation && (
        <label>
          导航
          <InputNumber
            aria-label="导航"
            min={1}
            max={value.navigation.count}
            value={value.navigation.index + 1}
            onChange={(n) =>
              perform(() => value.navigation?.goTo((n ?? 1) - 1))
            }
          />{' '}
          / {value.navigation.count}
        </label>
      )}
      {value.search && (
        <>
          <Input.Search
            aria-label="全文查找"
            placeholder="查找"
            onSearch={(q) => perform(() => value.search?.setQuery(q))}
          />
          <span>结果 {value.search.resultCount}</span>
          <Button onClick={() => perform(() => value.search?.previous())}>
            上个结果
          </Button>
          <Button onClick={() => perform(() => value.search?.next())}>
            下个结果
          </Button>
        </>
      )}
      {value.actions?.map((a) =>
        a.kind === 'select' ? (
          <label key={a.id}>
            {a.label}
            <Select
              value={a.value}
              disabled={a.enabled === false}
              options={[...(a.options ?? [])]}
              onChange={(v) => perform(() => a.run(v))}
            />
          </label>
        ) : (
          <Button
            key={a.id}
            disabled={a.enabled === false}
            aria-pressed={a.pressed}
            onClick={() => perform(() => a.run())}
          >
            {a.label}
          </Button>
        ),
      )}
    </section>
  );
}
