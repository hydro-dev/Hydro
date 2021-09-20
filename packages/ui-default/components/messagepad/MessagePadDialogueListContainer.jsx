import React from 'react';
import _ from 'lodash';
import { connect } from 'react-redux';
import 'jquery-scroll-lock';

import i18n from 'vj/utils/i18n';
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

export default connect(mapStateToProps, mapDispatchToProps)(class MessagePadDialogueListContainer extends React.PureComponent {
  componentDidMount() {
    $(this.refs.list).scrollLock({ strict: true });
  }

  render() {
    const orderedDialogues = _.orderBy(
      _.values(this.props.dialogues),
      (dialogue) => (_.maxBy(dialogue.messages, '_id')
        ? _.maxBy(dialogue.messages, '_id')._id
        : Number.POSITIVE_INFINITY),
      'desc',
    );
    return (
      <ol className="messagepad__list" ref="list">
        {_.map(orderedDialogues, (dialogue) => (
          <ListItem
            key={dialogue._id}
            userName={dialogue.udoc.uname}
            // eslint-disable-next-line no-nested-ternary
            summary={_.last(dialogue.messages)
              ? (_.last(dialogue.messages).flag & 4)
                ? i18n('[Richtext message]')
                : _.last(dialogue.messages).content
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
