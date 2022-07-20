/* eslint-disable react/static-property-placement */
import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';

import i18n from 'vj/utils/i18n';
import request from 'vj/utils/request';
import Icon from 'vj/components/react/IconComponent';
import getAvailableLangs from 'vj/utils/availableLangs';
import Toolbar, {
  ToolbarItemComponent as ToolbarItem,
  ToolbarButtonComponent as ToolbarButton,
  ToolbarSplitComponent as ToolbarSplit,
} from './ToolbarComponent';

const mapStateToProps = (state) => ({
  pretestVisible: state.ui.pretest.visible,
  sidebarVisible: state.ui.sidebar.visible,
  recordsVisible: state.ui.records.visible,
  isPosting: state.ui.isPosting,
  isRunning: state.pretest.isRunning,
  isWaiting: state.ui.isWaiting,
  waitSec: state.ui.waitSec,
  editorLang: state.editor.lang,
  editorCode: state.editor.code,
  pretestInput: state.pretest.input,
});

const mapDispatchToProps = (dispatch) => ({
  togglePanel(uiElement) {
    dispatch({
      type: 'SCRATCHPAD_UI_TOGGLE_VISIBILITY',
      payload: { uiElement },
    });
  },
  setEditorLanguage(lang) {
    dispatch({
      type: 'SCRATCHPAD_EDITOR_SET_LANG',
      payload: lang,
    });
  },
  postPretest(props) {
    const req = request.post(UiContext.postSubmitUrl, {
      lang: props.editorLang,
      code: props.editorCode,
      input: props.pretestInput || ' ',
      pretest: true,
    });
    dispatch({
      type: 'SCRATCHPAD_POST_PRETEST',
      payload: req,
    });
  },
  postSubmit(props) {
    const req = request.post(UiContext.postSubmitUrl, {
      lang: props.editorLang,
      code: props.editorCode,
    });
    dispatch({
      type: 'SCRATCHPAD_POST_SUBMIT',
      payload: req,
    });
  },
  loadSubmissions() {
    dispatch({
      type: 'SCRATCHPAD_RECORDS_LOAD_SUBMISSIONS',
      payload: request.get(UiContext.getSubmissionsUrl),
    });
  },
  tick() {
    dispatch({
      type: 'SCRATCHPAD_WAITING_TICK',
    });
  },
});

const availableLangs = getAvailableLangs(UiContext.pdoc.config.langs);
const keys = Object.keys(availableLangs);

export default connect(mapStateToProps, mapDispatchToProps)(class ScratchpadToolbarContainer extends React.PureComponent {
  static contextTypes = {
    store: PropTypes.object,
  };

  constructor(props) {
    super(props);
    if (!availableLangs[this.props.editorLang]) {
      // preference not allowed
      const key = keys.find((i) => availableLangs[i].pretest === this.props.editorLang);
      this.props.setEditorLanguage(key || keys[0]);
    }
  }

  componentDidMount() {
    if (this.props.recordsVisible) this.props.loadSubmissions();
  }

  componentDidUpdate() {
    if (this.props.waitSec > 0) setTimeout(() => this.props.tick(), 1000);
  }

  render() {
    let canUsePretest = ['default', 'fileio'].includes(UiContext.pdoc.config?.type);
    if (UiContext.pdoc.config?.type === 'remote_judge') {
      if (availableLangs[this.props.editorLang].pretest) canUsePretest = true;
    }
    if (availableLangs[this.props.editorLang]?.pretest === false) canUsePretest = false;
    return (
      <Toolbar>
        {canUsePretest && (
          <ToolbarButton
            disabled={this.props.isPosting || this.props.isRunning || this.props.isWaiting}
            className="scratchpad__toolbar__pretest"
            onClick={() => this.props.postPretest(this.props)}
            data-global-hotkey="f9"
            data-tooltip={`${i18n('Pretest Your Code')} (F9)`}
          >
            <Icon name="debug" />
            {' '}
            {i18n('Run Pretest')}
            {' '}
            {this.props.isWaiting ? `(${this.props.waitSec}s)` : '(F9)'}
          </ToolbarButton>
        )}
        <ToolbarButton
          disabled={this.props.isPosting || this.props.isWaiting}
          className="scratchpad__toolbar__submit"
          onClick={() => this.props.postSubmit(this.props)}
          data-global-hotkey="f10"
          data-tooltip={`${i18n('Submit Your Code')} (F10)`}
        >
          <Icon name="play" />
          {' '}
          {i18n('Submit Solution')}
          {' '}
          {this.props.isWaiting ? `(${this.props.waitSec}s)` : '(F10)'}
        </ToolbarButton>
        <ToolbarButton
          data-global-hotkey="alt+q"
          data-tooltip={`${i18n('Quit Scratchpad')} (Alt+Q)`}
          name="problem-sidebar__quit-scratchpad"
        >
          <Icon name="close" />
          {' '}
          {i18n('Exit')}
          {' '}
          (Alt+Q)
        </ToolbarButton>
        <ToolbarItem>
          <select
            className="select"
            disabled={this.props.isPosting}
            value={this.props.editorLang}
            onChange={(ev) => this.props.setEditorLanguage(ev.target.value)}
          >
            {_.map(availableLangs, (val, key) => (
              <option value={key} key={key}>{val.display}</option>
            ))}
          </select>
        </ToolbarItem>
        <ToolbarSplit />
        {canUsePretest && (
          <ToolbarButton
            activated={this.props.pretestVisible}
            onClick={() => this.props.togglePanel('pretest')}
            data-global-hotkey="alt+p"
            data-tooltip={`${i18n('Toggle Pretest Panel')} (Alt+P)`}
          >
            <Icon name="edit" />
            {' '}
            {i18n('Pretest')}
          </ToolbarButton>
        )}
        {UiContext.canViewRecord && (
          <ToolbarButton
            activated={this.props.recordsVisible}
            onClick={() => this.props.togglePanel('records')}
            data-global-hotkey="alt+r"
            data-tooltip={`${i18n('Toggle Records Panel')} (Alt+R)`}
          >
            <Icon name="flag" />
            {' '}
            {i18n('Records')}
          </ToolbarButton>
        )}
        {/* <ToolbarButton
          activated={this.props.sidebarVisible}
          onClick={() => this.props.togglePanel('sidebar')}
          data-global-hotkey="alt+w"
          data-tooltip={`${i18n('Toggle Sidebar')} (Alt+L)`}
        >
          <Icon name="edit" />
          {' '}
          {i18n('Pretest')}
        </ToolbarButton> */}
      </Toolbar>
    );
  }
});
