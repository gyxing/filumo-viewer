import { Alert, Button, Switch } from 'antd';
import React, { useState } from 'react';
import { CapabilityPanel } from './CapabilityPanel';
import { ConfigPanel } from './ConfigPanel';
import { DomShellProbe } from './DomShellProbe';
import { EventLog } from './EventLog';
import { SamplePicker } from './SamplePicker';
import { ViewerPanel } from './ViewerPanel';
import './smoke.less';
import { useSmokeController } from './useSmokeController';
/** 本机烟测整合新配置、公开能力与事件诊断，不加载旧组件。 */
export function SmokePage() {
  const c = useSmokeController();
  const [probe, setProbe] = useState(false);
  const progress = c.state.progress;
  return (
    <main className="fivo-smoke">
      <h1>Fivo 本地烟测</h1>
      <Alert message="仅开发可用；真实文件不进入公开构建，不上传。" />
      <SamplePicker onSample={c.selectSample} onFile={c.selectFile} />
      <ConfigPanel value={c.config} onChange={c.setConfig} />
      <div className="smoke-controls">
        <Button onClick={() => void c.destroy()}>销毁</Button>
        <Button onClick={c.reopen}>重新打开</Button>
        <Button onClick={() => c.setActive(!c.active)}>
          {c.active ? '停用' : '恢复'}
        </Button>
        <label>
          独立 DOM 外壳 <Switch checked={probe} onChange={setProbe} />
        </label>
      </div>
      <p role="status">会话状态：{c.state.status}</p>
      {progress && <p>进度：{JSON.stringify(progress)}</p>}
      {c.config.toolbarMode === 'custom' && (
        <CapabilityPanel
          value={c.capabilities}
          onError={(e) => c.log('error', e)}
        />
      )}
      <ViewerPanel controller={c} />
      {probe && <DomShellProbe />}
      <EventLog items={c.logs} clear={c.clearLogs} />
    </main>
  );
}
