import { Alert, Button, Progress, Tag } from 'antd';
import React from 'react';
import { CapabilityPanel } from './CapabilityPanel';
import { ConfigPanel } from './ConfigPanel';
import { DomShellProbe } from './DomShellProbe';
import { EventLog } from './EventLog';
import { SamplePicker } from './SamplePicker';
import { ViewerPanel } from './ViewerPanel';
import './smoke.less';
import { useSmokeController } from './useSmokeController';

/** 本机烟测工作台集中检查文件、配置、生命周期与事件，保持一个预览所有者。 */
export function SmokePage() {
  const c = useSmokeController();
  const progress = c.state.progress;
  const percent =
    progress?.total && progress.loaded !== undefined
      ? Math.max(
          0,
          Math.min(100, Math.round((progress.loaded / progress.total) * 100)),
        )
      : undefined;
  const previewHeight =
    typeof c.config.viewer.height === 'number'
      ? c.config.viewer.height + 'px'
      : c.config.viewer.height ?? '640px';
  return (
    <main
      className="fivo-smoke"
      style={{ '--smoke-preview-height': previewHeight } as React.CSSProperties}
    >
      <header className="smoke-heading">
        <div>
          <span className="smoke-eyebrow">FIVO / DEVELOPMENT</span>
          <h1>Fivo 本地烟测</h1>
          <p>样本切换、参数调试与生命周期检查</p>
        </div>
        <Tag color="blue">开发工作台</Tag>
      </header>
      <Alert
        className="smoke-local-note"
        message="仅开发可用；本机文件在浏览器解析，样本及日志不进入公开构建。"
        type="info"
      />
      <section className="smoke-configuration" aria-label="预览参数">
        <header className="smoke-section-heading">
          <h2>预览参数</h2>
          <div className="smoke-target" role="group" aria-label="测试对象">
            <Button
              type={c.target === 'document' ? 'primary' : 'default'}
              aria-pressed={c.target === 'document'}
              onClick={() => c.setTarget('document')}
            >
              文档文件
            </Button>
            <Button
              type={c.target === 'probe' ? 'primary' : 'default'}
              aria-pressed={c.target === 'probe'}
              onClick={() => c.setTarget('probe')}
            >
              DOM 外壳
            </Button>
          </div>
        </header>
        <ConfigPanel
          value={c.config}
          onChange={c.setConfig}
          target={c.target}
          format={c.state.pluginId}
        />
        <div className="smoke-actions">
          <Button onClick={c.resetConfig}>恢复默认值</Button>
          <Button
            onClick={c.reopen}
            disabled={c.target === 'document' && !c.source}
          >
            重新打开
          </Button>
          <Button disabled={!c.mounted} onClick={() => void c.destroy()}>
            销毁
          </Button>
          <Button disabled={!c.mounted} onClick={() => c.setActive(!c.active)}>
            {c.active ? '停用' : '恢复'}
          </Button>
          <span>视图参数即时生效；格式创建参数变化会重新打开当前文档。</span>
        </div>
      </section>
      <div className="smoke-workspace">
        <SamplePicker
          selectedId={c.selectedId}
          onSample={c.selectSample}
          onFile={c.selectFile}
          accept={c.plugins.some((plugin) => plugin.document.detectFallback)
            ? ''
            : c.plugins.flatMap((plugin) => [...plugin.document.extensions]).join(',')}
        />
        <section className="smoke-preview" aria-label="文档预览">
          <header className="smoke-preview-heading">
            <div>
              <strong>
                {c.target === 'probe'
                  ? '独立 DOM 外壳'
                  : c.source?.name ?? '选择样本或本机文件'}
              </strong>
              <span role="status">
                {c.sampleLoading
                  ? '正在读取样本'
                  : '会话状态：' + c.state.status}
                {!c.active ? ' · 已停用' : ''}
              </span>
            </div>
            <Tag>
              {c.target === 'probe' ? '非分页宿主' : c.state.pluginId ?? '文档'}
            </Tag>
          </header>
          {c.sourceError && <Alert message={c.sourceError} type="error" />}
          {progress && (
            <div className="smoke-progress">
              <span>{progress.phase}</span>
              {percent !== undefined && (
                <Progress percent={percent} size="small" />
              )}
            </div>
          )}
          {c.config.toolbarMode === 'custom' && (
            <CapabilityPanel
              value={c.capabilities}
              onError={(error) => c.log('error', error)}
            />
          )}
          {c.mounted && c.target === 'probe' ? (
            <DomShellProbe controller={c} />
          ) : (
            <ViewerPanel controller={c} />
          )}
        </section>
      </div>
      <EventLog items={c.logs} clear={c.clearLogs} />
    </main>
  );
}
