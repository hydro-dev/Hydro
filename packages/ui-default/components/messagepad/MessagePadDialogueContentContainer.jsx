import React from 'react';
import { connect } from 'react-redux';
import TimeAgo from 'timeago-react';
import moment from 'dayjs';
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

export default connect(mapStateToProps)(class MessagePadDialogueContentContainer extends React.PureComponent {
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

  renderContent(msg) {
    if (msg.from === 1) {
      // Is system message
      try {
        const data = JSON.parse(msg.content);
        return i18n(data.message, ...data.params);
      } catch (e) { }
      return i18n(msg.content);
    }
    return msg.content;
  }

  renderInner() {
    if (this.props.activeId === null) return [];
    return this.props.item.messages.map((msg) => (
      <Message
        key={msg._id}
        isSelf={msg.from === UserContext._id}
        faceUrl={
          msg.from === UserContext._id
            ? UserContext.avatarUrl
            : this.props.item.udoc.avatarUrl
        }
      >
        <div>{this.renderContent(msg)}</div>
        <time data-tooltip={moment(parseMongoId(msg._id).timestamp * 1000).format('YYYY-MM-DD HH:mm:ss')}>
          <TimeAgo datetime={parseMongoId(msg._id).timestamp * 1000} locale={i18n('timeago_locale')} />
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
