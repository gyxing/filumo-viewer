import React, { useState } from 'react';
import type { WebsiteLocale } from './home-content';
import { generateExample, type PlaygroundCodeTab } from './playground-code';
import type { PlaygroundConfig } from './playground-config';
import type { PlaygroundContent } from './playground-content';
import { getSiteCopyLabel, useSiteCopyFeedback } from './site-copy';

// 标签顺序也决定左右方向键的焦点顺序。
const TABS: { id: PlaygroundCodeTab; label: string }[] = [
  { id: 'react', label: 'React' },
  { id: 'vue3', label: 'Vue 3' },
  { id: 'vue2', label: 'Vue 2' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'config', label: 'Configuration' },
];
/** 显示与实时预览配置一致的多框架示例，并保留键盘切换和复制反馈。 */
export function PlaygroundCodePanel({
  config,
  content,
  locale,
}: {
  config: PlaygroundConfig;
  content: PlaygroundContent;
  locale: WebsiteLocale;
}) {
  const [tab, setTab] = useState<PlaygroundCodeTab>('react');
  const feedback = useSiteCopyFeedback();
  const source = generateExample(config, tab, locale);
  const onKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % TABS.length
        : event.key === 'ArrowLeft'
        ? (index + TABS.length - 1) % TABS.length
        : event.key === 'Home'
        ? 0
        : event.key === 'End'
        ? TABS.length - 1
        : undefined;
    if (next === undefined) return;
    event.preventDefault();
    setTab(TABS[next].id);
    document.getElementById('playground-code-' + TABS[next].id)?.focus();
  };
  return (
    <section
      className="fivo-playground-code"
      aria-labelledby="playground-code-title"
    >
      <div className="fivo-playground-card-heading">
        <h2 id="playground-code-title">{content.code}</h2>
        <button
          type="button"
          aria-live="polite"
          onClick={() => void feedback.copy(source)}
        >
          {getSiteCopyLabel(feedback.state, {
            idle: content.copy,
            copied: content.copied,
            failed: content.copyFailed,
          })}
        </button>
      </div>
      <p className="fivo-playground-code-hint">{content.codeHint}</p>
      <div
        className="fivo-playground-code-tabs"
        role="tablist"
        aria-label={content.code}
      >
        {TABS.map((item, index) => (
          <button
            type="button"
            key={item.id}
            id={'playground-code-' + item.id}
            role="tab"
            aria-selected={tab === item.id}
            aria-controls="playground-code-panel"
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => onKey(event, index)}
          >
            {item.id === 'config' ? content.config : item.label}
          </button>
        ))}
      </div>
      <pre
        className="fivo-doc-code"
        id="playground-code-panel"
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={'playground-code-' + tab}
      >
        <code>{source}</code>
      </pre>
    </section>
  );
}
