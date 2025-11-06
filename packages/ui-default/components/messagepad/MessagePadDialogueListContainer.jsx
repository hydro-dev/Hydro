import 'jquery-scroll-lock';

import $ from 'jquery';
import _ from 'lodash';
import React from 'react';
import { connect } from 'react-redux';
import { i18n } from 'vj/utils';
import ListItem from './DialogueListItemComponent';

const mapStateToProps = (state) => ({
  activeId: state.activeId,
  dialogues: state.dialogues,
});

const mapDispatchToProps = (dispatch) => ({
  handleClick(id) {
    dispatch({
      type: 'DIALOGUES_SWITCH_TO',
      payload: id,
    });
  },
});

// eslint-disable-next-line react-refresh/only-export-components
export default connect(mapStateToProps, mapDispatchToProps)(class MessagePadDialogueListContainer extends React.PureComponent {
  render() {
    const orderedDialogues = _.orderBy(
      _.values(this.props.dialogues),
      (dialogue) => (_.maxBy(dialogue.messages, '_id')
        ? _.maxBy(dialogue.messages, '_id')._id
        : Number.POSITIVE_INFINITY),
      'desc',
    );
    return (
      <ol className="messagepad__list" ref={(ref) => $(ref).scrollLock({ strict: true })}>
        {_.map(orderedDialogues, (dialogue) => (
          <ListItem
            key={dialogue._id}
            userName={dialogue.udoc.uname}
            summary={dialogue.messages.length
              ? (_.maxBy(dialogue.messages, '_id').flag & 4)
                ? i18n('[Richtext message]')
                : _.maxBy(dialogue.messages, '_id').content
              : ''}
            faceUrl={dialogue.udoc.avatarUrl}
            active={dialogue._id === this.props.activeId}
            onClick={() => this.props.handleClick(dialogue._id)}
          />
        ))}
      </ol>
    );
  }
});
