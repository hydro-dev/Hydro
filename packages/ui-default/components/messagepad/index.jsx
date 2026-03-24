import PropTypes from 'prop-types';
import React from 'react';
import { connect } from 'react-redux';
import Icon from 'vj/components/react/IconComponent';
import { i18n, request } from 'vj/utils';
import MessagePadDialogueContent from './MessagePadDialogueContentContainer';
import MessagePadDialogueList from './MessagePadDialogueListContainer';
import MessagePadInput from './MessagePadInputContainer';

const mapDispatchToProps = (dispatch) => ({
  loadDialogues() {
    dispatch({
      type: 'DIALOGUES_LOAD_DIALOGUES',
      payload: request.get('', { _: Date.now() }),
    });
  },
});

export default connect(null, mapDispatchToProps)(class MessagePadContainer extends React.PureComponent {
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
});
