import { Button, Tabs } from '@mantine/core';
import { Allotment } from 'allotment';
import { ContextMenuProvider } from 'mantine-contextmenu';
import React from 'react';
import { useSelector, useStore } from 'react-redux';
import { confirm } from 'vj/components/dialog/index';
import { i18n } from 'vj/utils';
import ProblemConfigEditor from './ProblemConfigEditor';
import ProblemConfigForm from './ProblemConfigForm';
import { ProblemConfigTree } from './ProblemConfigTree';
import { RootState } from './reducer';

interface Props {
  onSave: () => void;
}

export default function ProblemConfig(props: Props) {
  const [selected, setSelected] = React.useState('basic');
  const [container, setContainer] = React.useState<HTMLDivElement | null>(null);
  const [tabs, setTabs] = React.useState<HTMLDivElement | null>(null);
  const [editor, setEditor] = React.useState<any>(null);
  const store = useStore<RootState>();
  const valid = useSelector((state: RootState) => state.config.__valid);
  const errors = useSelector((state: RootState) => state.config.__errors, (a, b) => JSON.stringify(a) === JSON.stringify(b));

  const handleSave = React.useCallback(async () => {
    if (valid) props.onSave();
    else if (await confirm(i18n('Errors detected in the config. Confirm save?'))) props.onSave();
  }, [valid, props.onSave]);

  React.useEffect(() => {
    if (!container) return () => { };
    container.style.height ||= '600px';
    const callback = () => {
      setTimeout(() => {
        const target = Math.max(container.clientHeight, tabs?.clientHeight || 0);
        container.style.height = `${target}px`;
        if (editor) editor.layout();
      }, 50);
    };
    const dispose = store.subscribe(callback);
    window.addEventListener('resize', callback);
    return () => {
      dispose();
      window.removeEventListener('resize', callback);
    };
  }, [container, tabs, store]);

  return <ContextMenuProvider>
    <div ref={setContainer}>
      <Allotment defaultSizes={[2, 3]}>
        <Allotment.Pane>
          <div style={{ height: '100%', overflow: 'auto' }}>
            <ProblemConfigEditor ref={setEditor} />
          </div>
        </Allotment.Pane>
        <Allotment.Pane>
          <Tabs
            ref={setTabs}
            value={valid ? selected : 'errors'}
            keepMounted={false}
            style={{ paddingLeft: 20 }}
            onChange={(t) => (t !== 'errors' && t && setSelected(t.toString()))}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Tabs.List>
                <Tabs.Tab value="basic" disabled={!valid}>{i18n('Basic')}</Tabs.Tab>
                <Tabs.Tab value="subtasks" disabled={!valid}>{i18n('Subtasks')}</Tabs.Tab>
                <Tabs.Tab value="errors" disabled={valid}>{errors.length ? `Errors(${errors.length})` : 'No Errors'}</Tabs.Tab>
              </Tabs.List>
              <Button onClick={handleSave}>
                {i18n('Save')}
              </Button>
            </div>
            <Tabs.Panel value="basic">
              <ProblemConfigForm />
            </Tabs.Panel>
            <Tabs.Panel value="subtasks">
              <ProblemConfigTree />
            </Tabs.Panel>
            <Tabs.Panel value="errors">
              <div>{errors.map((i) => (<pre key={i}>{i}</pre>))}</div>
            </Tabs.Panel>
          </Tabs>
        </Allotment.Pane>
      </Allotment>
    </div>
  </ContextMenuProvider>;
}
