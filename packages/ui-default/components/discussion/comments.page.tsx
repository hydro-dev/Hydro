import 'jquery.easing';

import * as React from 'react';
import ReactDOM from 'react-dom';
import { Popover } from '@blueprintjs/core';
import { AutoloadPage } from 'vj/misc/Page';
import CommentBox from 'vj/components/discussion/CommentBox';
import { ConfirmDialog } from 'vj/components/dialog';

import delay from 'vj/utils/delay';
import { slideDown, slideUp } from 'vj/utils/slide';
import request from 'vj/utils/request';
import i18n from 'vj/utils/i18n';
import tpl from 'vj/utils/tpl';
import { chunk } from 'lodash';

const $replyTemplate = $('.commentbox-container').eq(0).clone();

function createReplyContainer($parent) {
  const $container = $replyTemplate
    .clone()
    .hide()
    .prependTo($parent.find('.commentbox-reply-target').eq(0))
    .trigger('vjContentNew');
  return $container.find('.commentbox-placeholder');
}

async function showReplyContainer($parent) {
  const $container = $parent.find('.commentbox-container');
  // TODO: fix ugly hack. cannot get $container rect because it is invisible
  const rect = $container.parent()[0].getBoundingClientRect();
  const rectBody = document.body.getBoundingClientRect();
  if (rect.top < 100 || rect.top + 100 > window.innerHeight) {
    const targetScrollTop = rect.top - rectBody.top - window.innerHeight * 0.382;
    $('html, body').stop().animate({ scrollTop: targetScrollTop }, 400, 'easeOutCubic');
    await delay(300);
    // delay duration is set smaller than animation duration intentionally
  }
  $container.css('opacity', 0);
  await slideDown($container, 300);
  await $container.transition({ opacity: 1 }, { duration: 200 }).promise();
  $container.removeAttr('style');
}

async function destroyReplyContainer($parent) {
  const $container = $parent.find('.commentbox-container');
  $container.css('opacity', 1);
  await $container.transition({ opacity: 0 }, { duration: 200 }).promise();
  await slideUp($container, 300);
  $container.remove();
}

function onClickDummyBox(ev) {
  const $evTarget = $(ev.currentTarget);

  if (CommentBox.get($evTarget)) {
    CommentBox.get($evTarget).focus();
    return;
  }

  const $mediaBody = $evTarget.closest('.media__body');

  const opt = {
    form: JSON.parse($evTarget.attr('data-form')),
    mode: 'comment',
    onCancel: () => {
      $mediaBody.removeClass('is-editing');
    },
  };

  $mediaBody.addClass('is-editing');

  CommentBox
    .getOrConstruct($evTarget, opt)
    .appendTo($mediaBody.find('.commentbox-placeholder').eq(0))
    .focus();
}

async function onCommentClickReplyComment(ev, options: any = {}) {
  const $evTarget = $(ev.currentTarget);

  if (CommentBox.get($evTarget)) {
    // If comment box is already expanded,
    // we should insert "initialText"
    CommentBox
      .get($evTarget)
      .insertText(options.initialText || '')
      .focus();
    return;
  }

  const $mediaBody = $evTarget.closest('.media__body');

  const opt = {
    initialText: '',
    mode: 'reply',
    ...options,
    onCancel: async () => {
      await destroyReplyContainer($mediaBody);
    },
  };

  const cbox = CommentBox
    .getOrConstruct($evTarget, {
      form: JSON.parse($evTarget.attr('data-form')),
      ...opt,
    })
    .appendTo(createReplyContainer($mediaBody));
  await showReplyContainer($mediaBody);
  cbox.focus();
}

async function onCommentClickReplyReply(ev) {
  console.log(ev);
  const $evTarget = $(ev.currentTarget);
  const $mediaBody = $evTarget.closest('.media__body');
  const uid = $mediaBody
    .find('.user-profile-name')
    .attr('href').split('/user/')[1];

  $evTarget
    .closest('.dczcomments__item')
    .find('[data-op="reply"][data-type="comment"]').eq(0)
    .trigger('click', { initialText: `@[](/user/${uid.trim()}) ` });
}

async function onCommentClickEdit(mode, ev) {
  const $evTarget = $(ev.currentTarget);

  if (CommentBox.get($evTarget)) {
    CommentBox.get($evTarget).focus();
    return;
  }

  const $mediaBody = $evTarget.closest('.media__body');

  const raw = await request.get(
    $mediaBody.find('.typo').eq(0).attr('data-raw-url'),
    {},
    { dataType: 'text' },
  );

  const opt = {
    initialText: raw,
    form: JSON.parse($evTarget.attr('data-form')),
    mode,
    onCancel: () => {
      $mediaBody.removeClass('is-editing');
    },
  };

  $mediaBody.addClass('is-editing');

  CommentBox
    .getOrConstruct($evTarget, opt)
    .appendTo($mediaBody.find('.commentbox-edit-target').eq(0))
    .focus();
}

function onCommentClickEditComment(ev) {
  return onCommentClickEdit('comment-update', ev);
}

function onCommentClickEditReply(ev) {
  return onCommentClickEdit('reply-update', ev);
}

async function onCommentClickDelete(type, ev) {
  const message = (type === 'comment')
    ? 'Confirm deleting this comment? Its replies will be deleted as well.'
    : 'Confirm deleting this reply?';
  const action = await new ConfirmDialog({
    $body: tpl.typoMsg(i18n(message)),
  }).open();
  if (action !== 'yes') return;

  const $evTarget = $(ev.currentTarget);
  const form = JSON.parse($evTarget.attr('data-form'));

  await request.post('', form);
  window.location.reload();
}

function onCommentClickDeleteComment(ev) {
  onCommentClickDelete('comment', ev);
}

function onCommentClickDeleteReply(ev) {
  onCommentClickDelete('reply', ev);
}

function renderReactions(reactions, self, rootEle) {
  let html = '';
  for (const key in reactions) {
    if (!reactions[key]) continue;
    html += `<div class="reaction${self[key] ? ' active' : ''}"><span class="emoji">${key}</span> ${reactions[key]}</div>\n`;
  }
  rootEle.html(html);
}

async function handleEmojiClick(payload, emoji, ele) {
  const res = await request.post('', { ...payload, emoji });
  renderReactions(res.doc?.react, res.sdoc?.react, ele);
}

function getRow(count) {
  if (count <= 2) return 2;
  if (count <= 3) return 3;
  if (count <= 4) return 4;
  if (count <= 6) return 6;
  return 12;
}

function Reaction({ payload, ele }) {
  const emojiList: string[] = (UiContext.emojiList || '👍 👎 😄 😕 ❤️ 🤔 🤣 🌿 🍋 🕊️ 👀 🤣').split(' ');
  const elesPerRow = getRow(Math.sqrt(emojiList.length));
  const [focus, updateFocus] = React.useState(false);
  const [finish, updateFinish] = React.useState(false);
  if (finish) setTimeout(() => updateFinish(false), 1000);
  return (
    // eslint-disable-next-line no-nested-ternary
    <Popover usePortal interactionKind="hover" isOpen={finish ? false : (focus ? true : undefined)}>
      <span className="icon icon-emoji"></span>
      <div>
        {chunk(emojiList, elesPerRow).map((line, i) => (
          <div className="row" key={+i} style={{ paddingBottom: 4, paddingTop: 4 }}>
            {line.map((emoji) => (
              <div
                key={emoji}
                className={`medium-${12 / elesPerRow} small-${12 / elesPerRow} columns`}
                onClick={() => handleEmojiClick(payload, emoji, ele).then(() => updateFinish(true))}
              >
                {emoji}
              </div>
            ))}
          </div>
        ))}
        <div className="row" style={{ paddingTop: 7, paddingBottom: 4 }}>
          <div className="medium-12 columns">
            <input name="emojiSuggest" onFocus={() => updateFocus(true)} onBlur={() => updateFocus(false)}></input>
          </div>
        </div>
      </div>
    </Popover>
  );
}

const commentsPage = new AutoloadPage('commentsPage', () => {
  $(document).on('click', '[name="dczcomments__dummy-box"]', onClickDummyBox);
  $(document).on('click', '[data-op="reply"][data-type="comment"]', onCommentClickReplyComment);
  $(document).on('click', '[data-op="reply"][data-type="reply"]', onCommentClickReplyReply);
  $(document).on('click', '[data-op="edit"][data-type="comment"]', onCommentClickEditComment);
  $(document).on('click', '[data-op="edit"][data-type="reply"]', onCommentClickEditReply);
  $(document).on('click', '[data-op="delete"][data-type="comment"]', onCommentClickDeleteComment);
  $(document).on('click', '[data-op="delete"][data-type="reply"]', onCommentClickDeleteReply);

  $('[data-op="react"]').each((i, e) => {
    ReactDOM.render(<Reaction payload={$(e).data('form')} ele={$(e).closest('.media__body').find('.reactions')} />, e);
  });
  $(document).on('click', '.reaction', async (e) => {
    const target = $(e.currentTarget);
    const res = await request.post('', {
      operation: 'reaction',
      type: 'drid',
      id: target.parent().parent().data('drid'),
      emoji: target.text().trim().split(' ')[0],
      reverse: target.hasClass('active'),
    });
    renderReactions(res.doc?.react, res.sdoc?.react, target.parent());
  });
});

export default commentsPage;
