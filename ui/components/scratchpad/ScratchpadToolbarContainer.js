/* eslint-disable react/static-property-placement */
import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';

import i18n from 'vj/utils/i18n';
import request from 'vj/utils/request';
import * as languageEnum from 'vj/constant/language';
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
  postPretest(context) {
    const state = context.store.getState();
    const { input } = state.pretest;
    const req = request.post(Context.postPretestUrl, {
      lang: state.editor.lang,
      code: state.editor.code,
      input,
    });
    dispatch({
      type: 'SCRATCHPAD_POST_PRETEST',
      payload: req,
    });
  },
  postSubmit(context) {
    const state = context.store.getState();
    const req = request.post(Context.postSubmitUrl, {
      lang: state.editor.lang,
      code: state.editor.code,
    });
    dispatch({
      type: 'SCRATCHPAD_POST_SUBMIT',
      payload: req,
    });
  },
  loadSubmissions() {
    dispatch({
      type: 'SCRATCHPAD_RECORDS_LOAD_SUBMISSIONS',
      payload: request.get(Context.getSubmissionsUrl),
    });
  },
  handleClickRefresh() {
    this.loadSubmissions();
  },
});

@connect(mapStateToProps, mapDispatchToProps)
export default class ScratchpadToolbarContainer extends React.PureComponent {
  static contextTypes = {
    store: PropTypes.object,
  };

  componentDidMount() {
    this.props.loadSubmissions();
  }

  render() {
    return (
      <Toolbar>
        <ToolbarButton
          disabled={this.props.isPosting || this.props.isRunning}
          className="scratchpad__toolbar__pretest"
          onClick={() => this.props.postPretest(this.context)}
          data-global-hotkey="f9"
          data-tooltip={`${i18n('Pretest Your Code')} (F9)`}
        >
          <Icon name="debug" />
          {' '}
          {i18n('Run Pretest')}
          {' '}
          (F9)
        </ToolbarButton>
        <ToolbarButton
          disabled={this.props.isPosting}
          className="scratchpad__toolbar__submit"
          onClick={() => this.props.postSubmit(this.context)}
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
        <ToolbarItem>
          <select
            className="select"
            disabled={this.props.isPosting}
            value={this.props.editorLang}
            onChange={(ev) => this.props.setEditorLanguage(ev.target.value)}
          >
            {_.map(languageEnum.LANG_TEXTS, (val, key) => (
              <option value={key} key={key}>{val}</option>
            ))}
          </select>
        </ToolbarItem>
        <ToolbarSplit />
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
      </Toolbar>
    );
  }
}
