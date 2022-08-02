import React from 'react';
import SplitPane from 'react-split-pane';
import { useDispatch, useSelector } from 'react-redux';
import _ from 'lodash';
import SplitPaneFillOverlay from 'vj/components/react-splitpane/SplitPaneFillOverlayComponent';
import ProblemIcon from '@vscode/codicons/src/icons/file.svg?react';
import Dom from 'vj/components/react/DomComponent';
import ScratchpadToolbar from './ScratchpadToolbarContainer';
import ScratchpadEditor from './ScratchpadEditorContainer';
import ScratchpadPretest from './ScratchpadPretestContainer';
import ScratchpadRecords from './ScratchpadRecordsContainer';

function buildNestedPane([a, ...panes], mode = 'horizontal') {
  const elements = [
    a,
    ...panes.filter((p) => p.props.visible),
  ];
  if (elements.length === 1) return a;
  return elements
    .reduce((prev, curr) => (
      <SplitPane
        split={mode}
        primary="second"
        defaultSize={curr.props.size}
        key={curr.element.key}
        onChange={curr.onChange}
      >
        {prev}
        {curr.element}
      </SplitPane>
    ));
}

const pages = {
  problem: {
    icon: () => <ProblemIcon />,
    component: () => <Dom childDom={$('.problem-content').get(0)} id="problem-content" />,
  },
};

let rerenderCallback = null;
export function addPage(key, icon, component) {
  pages[key] = {
    icon,
    component,
  };
  rerenderCallback?.();
}
window.Hydro.scratchpad = { addPage, pages };

export default function ScratchpadContainer() {
  const [, updateState] = React.useState();
  const forceUpdate = React.useCallback(() => updateState({}), []);
  React.useEffect(() => {
    rerenderCallback = forceUpdate;
  }, []);
  const dispatch = useDispatch();
  const ui = useSelector((state) => state.ui, _.isEqual);

  const handleChangeSize = _.debounce((uiElement, size) => {
    dispatch({
      type: 'SCRATCHPAD_UI_CHANGE_SIZE',
      payload: {
        uiElement,
        size,
      },
    });
    $('#scratchpad').trigger('vjScratchpadRelayout');
    forceUpdate();
  }, 500);
  const switchToPage = (target) => {
    dispatch({
      type: 'SCRATCHPAD_SWITCH_TO_PAGE',
      payload: target,
    });
  };

  const showSidebar = Object.keys(pages).length > 1;

  return (
    <SplitPane
      split="vertical"
      primary="first"
      size={showSidebar ? 50 : 0}
      allowResize={false}
    >
      <div className="scratchpad__tablist" style={{ display: showSidebar ? 'block' : 'none' }}>
        {Object.keys(pages).map((key) => {
          const Component = pages[key].icon;
          return (
            <div key={key} className={key === ui.activePage ? 'scratchpad__tab-active' : ''} onClick={() => switchToPage(key)}>
              <Component />
            </div>
          );
        })}
      </div>
      <SplitPane
        defaultSize={ui.main.size}
        minSize={250}
        split="vertical"
        primary="second"
        onChange={(size) => handleChangeSize('main', size)}
      >
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
        {buildNestedPane([
          <SplitPaneFillOverlay key="editor" className="flex-col">
            <ScratchpadToolbar />
            <ScratchpadEditor />
          </SplitPaneFillOverlay>,
          {
            props: ui.pretest,
            onChange: (size) => handleChangeSize('pretest', size),
            element: <ScratchpadPretest key="pretest" />,
          },
          {
            props: ui.records,
            onChange: (size) => handleChangeSize('records', size),
            element: <ScratchpadRecords key="records" />,
          },
        ])}
      </SplitPane>
    </SplitPane>
  );
}
