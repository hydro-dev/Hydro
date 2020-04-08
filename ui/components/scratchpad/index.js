import React from 'react';
import SplitPane from 'react-split-pane';
import { connect } from 'react-redux';
import _ from 'lodash';
import SplitPaneFillOverlay from 'vj/components/react-splitpane/SplitPaneFillOverlayComponent';
import Dom from 'vj/components/react/DomComponent';
import ScratchpadToolbar from './ScratchpadToolbarContainer';
import ScratchpadEditor from './ScratchpadEditorContainer';
import ScratchpadPretest from './ScratchpadPretestContainer';
import ScratchpadRecords from './ScratchpadRecordsContainer';

/*
a: React.Component
panes: [{
  id: string,
  element: React.Component,
  props: {
    visible: bool,
    size: string|int,
  },
}]
*/
function buildNestedPane([a, ...panes]) {
  const elements = [
    a,
    ...panes.filter(p => p.props.visible),
  ];
  if (elements.length === 1) {
    return a;
  }
  return elements
    .reduce((prev, curr) => (
      <SplitPane
        split="horizontal"
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

const mapStateToProps = state => ({
  ui: state.ui,
});

const mapDispatchToProps = dispatch => ({
  changeUiSize: _.debounce((uiElement, size) => {
    dispatch({
      type: 'SCRATCHPAD_UI_CHANGE_SIZE',
      payload: {
        uiElement,
        size,
      },
    });
  }, 500),
});

@connect(mapStateToProps, mapDispatchToProps)
export default class ScratchpadContainer extends React.PureComponent {
  handleChangeSize(uiElement, size) {
    this.props.changeUiSize(uiElement, size);
    $('#scratchpad').trigger('vjScratchpadRelayout');
  }

  render() {
    return (
      <SplitPane
        defaultSize={this.props.ui.main.size}
        minSize={250}
        split="vertical"
        primary="second"
        onChange={size => this.handleChangeSize('main', size)}
      >
        <Dom className="scratchpad__problem" childDom={$('.problem-content').get(0)} />
        {buildNestedPane([
          <SplitPaneFillOverlay key="editor" className="flex-col">
            <ScratchpadToolbar />
            <ScratchpadEditor />
          </SplitPaneFillOverlay>,
          {
            props: this.props.ui.pretest,
            onChange: size => this.handleChangeSize('pretest', size),
            element: <ScratchpadPretest key="pretest" />,
          },
          {
            props: this.props.ui.records,
            onChange: size => this.handleChangeSize('records', size),
            element: <ScratchpadRecords key="records" />,
          },
        ])}
      </SplitPane>
    );
  }
}
