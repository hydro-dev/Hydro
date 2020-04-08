import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';

import request from 'vj/utils/request';
import i18n from 'vj/utils/i18n';
import Icon from 'vj/components/react/IconComponent';
import MessagePadDialogueList from './MessagePadDialogueListContainer';
import MessagePadDialogueContent from './MessagePadDialogueContentContainer';
import MessagePadInput from './MessagePadInputContainer';

const mapDispatchToProps = dispatch => ({
  loadDialogues() {
    dispatch({
      type: 'DIALOGUES_LOAD_DIALOGUES',
      payload: request.get(''),
    });
  },
});

@connect(null, mapDispatchToProps)
export default class MessagePadContainer extends React.PureComponent {
  static propTypes = {
    onAdd: PropTypes.func.isRequired,
  };

  componentDidMount() {
    this.props.loadDialogues();
  }

  render() {
    return (
      <div className="messagepad clearfix">
        <div className="messagepad__sidebar">
          <div className="section__header">
            <button
              onClick={() => this.props.onAdd()}
              className="primary rounded button"
            >
              <Icon name="add" />
              {' '}
              {i18n('New')}
            </button>
          </div>
          <MessagePadDialogueList />
        </div>
        <MessagePadDialogueContent />
        <MessagePadInput />
      </div>
    );
  }
}
