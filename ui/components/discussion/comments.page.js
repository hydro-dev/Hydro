import 'jquery.easing';

import { AutoloadPage } from 'vj/misc/PageLoader';
import CommentBox from 'vj/components/discussion/CommentBox';
import { ConfirmDialog } from 'vj/components/dialog';

import delay from 'vj/utils/delay';
import { slideDown, slideUp } from 'vj/utils/slide';
import request from 'vj/utils/request';
import i18n from 'vj/utils/i18n';
import tpl from 'vj/utils/tpl';

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
    CommentBox
      .get($evTarget)
      .focus();
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

async function onCommentClickReplyComment(ev, options = {}) {
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
  const $evTarget = $(ev.currentTarget);
  const $mediaBody = $evTarget.closest('.media__body');
  const username = $mediaBody
    .find('.user-profile-name').eq(0)
    .text();

  $evTarget
    .closest('.dczcomments__item')
    .find('[name="dczcomments__op-reply-comment"]').eq(0)
    .trigger('click', { initialText: `@${username}: ` });
}

async function onCommentClickEdit(mode, ev) {
  const $evTarget = $(ev.currentTarget);

  if (CommentBox.get($evTarget)) {
    CommentBox
      .get($evTarget)
      .focus();
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
    $body: tpl`
      <div class="typo">
        <p>${i18n(message)}</p>
      </div>`,
  }).open();
  if (action !== 'yes') {
    return;
  }

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

const commentsPage = new AutoloadPage('commentsPage', () => {
  $(document).on('click', '[name="dczcomments__dummy-box"]', onClickDummyBox);
  $(document).on('click', '[name="dczcomments__op-reply-comment"]', onCommentClickReplyComment);
  $(document).on('click', '[name="dczcomments__op-reply-reply"]', onCommentClickReplyReply);
  $(document).on('click', '[name="dczcomments__op-edit-comment"]', onCommentClickEditComment);
  $(document).on('click', '[name="dczcomments__op-edit-reply"]', onCommentClickEditReply);
  $(document).on('click', '[name="dczcomments__op-delete-comment"]', onCommentClickDeleteComment);
  $(document).on('click', '[name="dczcomments__op-delete-reply"]', onCommentClickDeleteReply);
});

export default commentsPage;
