import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import classNames from 'classnames';
import Icon from 'vj/components/react/IconComponent';

import request from 'vj/utils/request';

const mapStateToProps = (state) => ({
  activeId: state.activeId,
  isPosting: state.activeId !== null
    ? state.isPosting[state.activeId]
    : false,
  inputValue: state.activeId !== null
    ? state.inputs[state.activeId]
    : '',
});

const mapDispatchToProps = (dispatch) => ({
  handleChange(id, value) {
    if (id === null) return;
    dispatch({
      type: 'DIALOGUES_INPUT_CHANGED',
      payload: value,
      meta: {
        dialogueId: id,
      },
    });
  },
  postSend(uid, value) {
    const req = request.post('', {
      operation: 'send',
      uid,
      content: value,
    });
    dispatch({
      type: 'DIALOGUES_POST_SEND',
      payload: req,
      meta: {
        dialogueId: uid,
      },
    });
  },
});

@connect(mapStateToProps, mapDispatchToProps)
export default class MessagePadInputContainer extends React.PureComponent {
  static contextTypes = {
    store: PropTypes.object,
  };

  UNSAFE_componentWillUpdate(nextProps) { // eslint-disable-line camelcase
    this.focusInput = (
      nextProps.activeId !== this.props.activeId
      || this.props.isPosting !== nextProps.isPosting && nextProps.isPosting === false
    );
  }

  componentDidUpdate() {
    if (this.focusInput) {
      const { scrollX, scrollY } = window;
      this.refs.input.focus();
      window.scrollTo(scrollX, scrollY);
    }
  }

  handleKeyDown(ev) {
    if (ev.keyCode === 13 && (ev.ctrlKey || ev.metaKey)) {
      this.submit();
    }
  }

  submit() {
    this.props.postSend(
      this.props.activeId,
      this.props.inputValue,
    );
  }

  render() {
    const cn = classNames('messagepad__input', {
      visible: this.props.activeId !== null,
    });
    return (
      <div className={cn}>
        <div className="messagepad__textarea-container">
          <textarea
            ref="input"
            data-markdown
            disabled={this.props.isPosting}
            value={this.props.inputValue}
            onKeyDown={(ev) => this.handleKeyDown(ev)}
            onChange={(ev) => this.props.handleChange(this.props.activeId, ev.target.value)}
          />
        </div>
        <button
          disabled={!this.props.inputValue.trim().length || this.props.isPosting}
          onClick={() => this.submit()}
        >
          <Icon name="send" />
        </button>
      </div>
    );
  }
}
