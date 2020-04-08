import React from 'react';
import _ from 'lodash';
import { connect } from 'react-redux';
import 'jquery-scroll-lock';

import ListItem from './DialogueListItemComponent';

const mapStateToProps = state => ({
  activeId: state.activeId,
  dialogues: state.dialogues,
});

const mapDispatchToProps = dispatch => ({
  handleClick(id) {
    dispatch({
      type: 'DIALOGUES_SWITCH_TO',
      payload: id,
    });
  },
});

@connect(mapStateToProps, mapDispatchToProps)
export default class MessagePadDialogueListContainer extends React.PureComponent {
  componentDidMount() {
    $(this.refs.list).scrollLock({ strict: true });
  }

  render() {
    const orderedDialogues = _.orderBy(
      _.values(this.props.dialogues),
      dialogue => (dialogue.isPlaceholder
        ? Number.POSITIVE_INFINITY
        : _.maxBy(dialogue.reply, 'at').at),
      'desc',
    );
    return (
      <ol className="messagepad__list" ref="list">
        {_.map(orderedDialogues, dialogue => (
          <ListItem
            key={dialogue._id}
            userName={
              dialogue.sender_uid === UserContext.uid
                ? dialogue.sendee_udoc.uname
                : dialogue.sender_udoc.uname
            }
            summary={
              dialogue.isPlaceholder
                ? ''
                : _.last(dialogue.reply).content
            }
            faceUrl={
              dialogue.sender_uid === UserContext.uid
                ? dialogue.sendee_udoc.gravatar_url
                : dialogue.sender_udoc.gravatar_url
            }
            active={dialogue._id === this.props.activeId}
            onClick={() => this.props.handleClick(dialogue._id)}
          />
        ))}
      </ol>
    );
  }
}
