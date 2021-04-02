import React from 'react';
import _ from 'lodash';
import { connect } from 'react-redux';
import TimeAgo from 'timeago-react';
import moment from 'moment';
import 'jquery-scroll-lock';
import 'jquery.easing';

import i18n from 'vj/utils/i18n';
import { parse as parseMongoId } from 'vj/utils/mongoId';
import Message from './MessageComponent';

const mapStateToProps = (state) => ({
  activeId: state.activeId,
  item: state.activeId !== null
    ? state.dialogues[state.activeId]
    : null,
});

export default connect(mapStateToProps, null)(class MessagePadDialogueContentContainer extends React.PureComponent {
  componentDidMount() {
    $(this.refs.list).scrollLock({ strict: true });
  }

  componentDidUpdate(prevProps) {
    const node = this.refs.list;
    if (this.props.activeId !== prevProps.activeId) {
      this.scrollToBottom = true;
      this.scrollWithAnimation = false;
    } else if (node.scrollTop + node.offsetHeight === node.scrollHeight) {
      this.scrollToBottom = true;
      this.scrollWithAnimation = true;
    } else this.scrollToBottom = false;

    if (this.scrollToBottom) {
      const targetScrollTop = node.scrollHeight - node.offsetHeight;
      if (this.scrollWithAnimation) {
        $(node).stop().animate({ scrollTop: targetScrollTop }, 200, 'easeOutCubic');
      } else {
        node.scrollTop = targetScrollTop;
      }
    }
  }

  renderInner() {
    if (this.props.activeId === null) {
      return [];
    }
    return _.map(this.props.item.messages, (reply) => (
      <Message
        key={reply._id}
        isSelf={reply.from === UserContext._id}
        faceUrl={
          reply.from === UserContext._id
            ? UserContext.gravatar
            : this.props.item.udoc.gravatar
        }
      >
        <div>{reply.content}</div>
        <time data-tooltip={moment(parseMongoId(reply._id).timestamp * 1000).format('YYYY-MM-DD HH:mm:ss')}>
          <TimeAgo datetime={parseMongoId(reply._id).timestamp * 1000} locale={i18n('timeago_locale')} />
        </time>
      </Message>
    ));
  }

  render() {
    return (
      <ol className="messagepad__content" ref="list">
        {this.renderInner()}
      </ol>
    );
  }
});
