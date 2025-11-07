import 'jquery-scroll-lock';
import 'jquery.easing';

import $ from 'jquery';
import moment from 'moment';
import React from 'react';
import { connect } from 'react-redux';
import TimeAgo from 'timeago-react';
import { i18n, mongoId } from 'vj/utils';
import Message from './MessageComponent';

const mapStateToProps = (state) => ({
  activeId: state.activeId,
  item: state.activeId !== null
    ? state.dialogues[state.activeId]
    : null,
});

// eslint-disable-next-line react-refresh/only-export-components
export default connect(mapStateToProps)(class MessagePadDialogueContentContainer extends React.PureComponent {
  componentDidUpdate(prevProps) {
    const node = this.state.ref;

    if (this.props.activeId !== prevProps.activeId) {
      this.scrollToBottom = true;
      this.scrollWithAnimation = false;
    } else if (node.scrollTop + node.offsetHeight === node.scrollHeight) {
      this.scrollToBottom = true;
      this.scrollWithAnimation = true;
    } else this.scrollToBottom = false;

    if (!node) return;
    $(this.state.ref).scrollLock({ strict: true });
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
    // TODO: FLAG_RICHTEXT
    if (msg.from === 1) {
      // Is system message
      try {
        const data = JSON.parse(msg.content);
        const str = i18n(data.message).replace(/\{([^{}]+)\}/g, (match, key) => `%placeholder%${key}%placeholder%`);
        const arr = str.split('%placeholder%');
        data.params ||= {};
        for (let i = 1; i < arr.length; i += 2) {
          if (arr[i].endsWith(':link')) {
            const link = data.params[arr[i].split(':link')[0]];
            if (!link) continue;
            arr[i] = <a style={{ color: 'wheat' }} href={link} key={i} target="_blank" rel="noreferrer">{link}</a>;
          } else {
            arr[i] = <span style={{ color: 'wheat' }} key={i}>{data.params[arr[i]]}</span>;
          }
        }
        return arr;
      } catch (e) { }
      return i18n(msg.content);
    }
    return msg.content;
  }

  renderInner() {
    if (this.props.activeId === null) return [];
    const sorted = this.props.item.messages
      .sort((msg1, msg2) => mongoId(msg1._id).timestamp - mongoId(msg2._id).timestamp);
    return sorted.map((msg) => (
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
        <time data-tooltip={moment(mongoId(msg._id).timestamp * 1000).format('YYYY-MM-DD HH:mm:ss')}>
          <TimeAgo datetime={mongoId(msg._id).timestamp * 1000} locale={i18n('timeago_locale')} />
        </time>
      </Message>
    ));
  }

  render() {
    return (
      <>
        <div className="messagepad__header">
          {this.props.item && (
            <a className="messagepad__content__header__title" href={`/user/${this.props.item.udoc._id}`}>
              {`${this.props.item.udoc.uname}(UID: ${this.props.item.udoc._id})`}
            </a>
          )}
        </div>
        <ol className="messagepad__content" ref={(ref) => { this.setState({ ...this.state, ref }); }}>
          {this.renderInner()}
        </ol>
      </>
    );
  }
});
