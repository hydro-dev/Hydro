/* eslint-disable react/static-property-placement */
import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';

import i18n from 'vj/utils/i18n';
import request from 'vj/utils/request';
import Icon from 'vj/components/react/IconComponent';
import Toolbar, {
  ToolbarItemComponent as ToolbarItem,
  ToolbarButtonComponent as ToolbarButton,
  ToolbarSplitComponent as ToolbarSplit,
} from './ToolbarComponent';

const mapStateToProps = (state) => ({
  pretestVisible: state.ui.pretest.visible,
  recordsVisible: state.ui.records.visible,
  isPosting: state.ui.isPosting,
  isRunning: state.pretest.isRunning,
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
  handleClickRefresh() {
    if (this.props.recordsVisible) this.loadSubmissions();
  },
});

export default connect(mapStateToProps, mapDispatchToProps)(class ScratchpadToolbarContainer extends React.PureComponent {
  static contextTypes = {
    store: PropTypes.object,
  };

  componentDidMount() {
    if (this.props.recordsVisible) this.props.loadSubmissions();
  }

  render() {
    const LANGS = {};
    const prefix = new Set(Object.keys(window.LANGS).filter((i) => i.includes('.')).map((i) => i.split('.')[0]));
    const domainId = UiContext.pdoc.reference?.domainId || UiContext.pdoc.domainId;
    for (const key in window.LANGS) {
      if (prefix.has(key)) continue;
      if (UiContext.pdoc.config.langs && !UiContext.pdoc.config.langs.includes(key)) continue;
      if (window.LANGS[key].domain && !window.LANGS[key].domain.includes(domainId)) continue;
      LANGS[key] = window.LANGS[key];
    }
    const keys = Object.keys(LANGS);
    if (!keys.includes(this.props.editorLang)) this.props.setEditorLanguage(keys[0]);
    const canUsePretest = ['default', 'fileio'].includes(UiContext.pdoc.config?.type);
    return (
      <Toolbar>
        {canUsePretest && (
          <ToolbarButton
            disabled={this.props.isPosting || this.props.isRunning}
            className="scratchpad__toolbar__pretest"
            onClick={() => this.props.postPretest(this.props)}
            data-global-hotkey="f9"
            data-tooltip={`${i18n('Pretest Your Code')} (F9)`}
          >
            <Icon name="debug" />
            {' '}
            {i18n('Run Pretest')}
            {' '}
            (F9)
          </ToolbarButton>
        )}
        <ToolbarButton
          disabled={this.props.isPosting}
          className="scratchpad__toolbar__submit"
          onClick={() => this.props.postSubmit(this.props)}
          data-global-hotkey="f10"
          data-tooltip={`${i18n('Submit Your Code')} (F10)`}
        >
          <Icon name="play" />
          {' '}
          {i18n('Submit Solution')}
          {' '}
          (F10)
        </ToolbarButton>
        <ToolbarButton
          data-tooltip={i18n('Refresh Records')}
          className="scratchpad__toolbar__refresh"
          data-global-hotkey="alt+f"
          onClick={() => this.props.handleClickRefresh()}
        >
          <Icon name="refresh" />
          {' '}
          {i18n('Refresh')}
          {' '}
          (Alt+F)
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
            {_.map(LANGS, (val, key) => (
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
      </Toolbar>
    );
  }
});
