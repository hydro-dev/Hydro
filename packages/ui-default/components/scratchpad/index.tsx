import ProblemIcon from '@vscode/codicons/src/icons/file.svg?react';
import SettingsIcon from '@vscode/codicons/src/icons/settings-gear.svg?react';
import { Allotment } from 'allotment';
import $ from 'jquery';
import _ from 'lodash';
import type * as monaco from 'monaco-editor';
import React from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import Dom from 'vj/components/react/DomComponent';
import { ctx, Service } from 'vj/context';
import ScratchpadEditor from './ScratchpadEditorContainer';
import ScratchpadPretest from './ScratchpadPretestContainer';
import ScratchpadRecords from './ScratchpadRecordsContainer';
import ScratchpadSettings from './ScratchpadSettings';
import ScratchpadToolbar from './ScratchpadToolbarContainer';

const pages = {
  problem: {
    icon: () => <ProblemIcon />,
    component: () => <Dom childDom={$('.problem-content').get(0)} />,
  },
  settings: {
    icon: () => <SettingsIcon />,
    component: () => <ScratchpadSettings />,
  },
};

let rerenderCallback = null;
class ScratchpadService extends Service {
  constructor(public store) {
    super(ctx, 'scratchpad', true);
    this.load = new Promise((resolve) => {
      this.loadCallback = resolve;
    });
  }

  pages = pages;
  load: Promise<void>;
  loadCallback: () => void;
  editor: monaco.editor.IStandaloneCodeEditor;
  monaco: typeof import('monaco-editor');

  init(editor: monaco.editor.IStandaloneCodeEditor, monaco: typeof import('monaco-editor')) {
    this.editor = editor;
    this.monaco = monaco;
    this.loadCallback();
  }

  addPage(key, icon, component) {
    pages[key] = {
      icon,
      component,
    };
    rerenderCallback?.();
  }
}
declare module '../../context' {
  interface Context {
    scratchpad: ScratchpadService;
  }
}

let scratchpad: ScratchpadService;

export default function ScratchpadContainer() {
  const store = useStore();
  if (!scratchpad) {
    scratchpad = new ScratchpadService(store);
    ctx.set('scratchpad', scratchpad);
  }
  const [, updateState] = React.useState<any>();
  const forceUpdate = React.useCallback(() => updateState({}), []);
  React.useEffect(() => {
    rerenderCallback = forceUpdate;
  }, []);
  const dispatch = useDispatch();
  const ui = useSelector<any, any>((state) => state.ui, _.isEqual);

  const handleChangeSize = _.debounce(() => {
    ctx.scratchpad.editor?.layout?.();
    $('#scratchpad').trigger('vjScratchpadRelayout');
    forceUpdate();
  }, 500);
  const switchToPage = (target) => {
    dispatch({
      type: 'SCRATCHPAD_SWITCH_TO_PAGE',
      payload: target,
    });
  };

  return (
    <Allotment onChange={handleChangeSize}>
      <Allotment.Pane visible={Object.keys(pages).length > 1} minSize={50} maxSize={50}>
        <div className="scratchpad__tablist">
          {Object.keys(pages).map((key) => {
            const Component = pages[key].icon;
            return (
              <div
                key={key}
                className={`scratchpad__tabicon-${key}${key === ui.activePage ? ' scratchpad__tab-active' : ''}`}
                onClick={() => switchToPage(key)}
              >
                <Component />
              </div>
            );
          })}
        </div>
      </Allotment.Pane>
      <Allotment.Pane visible={!!ui.activePage}>
        <div className="scratchpad__problem">
          {Object.keys(pages).map((key) => {
            const Component = pages[key].component;
            return (
              <div key={key} style={{ display: key === ui.activePage ? 'block' : 'none' }}>
                <Component />
              </div>
            );
          })}
        </div>
      </Allotment.Pane>
      <Allotment vertical onChange={handleChangeSize}>
        <div key="editor" className="flex-col splitpane-fill">
          <ScratchpadToolbar />
          <ScratchpadEditor />
        </div>
        <Allotment.Pane visible={ui.pretest.visible}>
          <ScratchpadPretest key="pretest" />
        </Allotment.Pane>
        <Allotment.Pane visible={ui.records.visible}>
          <ScratchpadRecords key="records" />
        </Allotment.Pane>
      </Allotment>
    </Allotment>
  );
}
