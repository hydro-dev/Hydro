import yaml from 'js-yaml';
import { NamedPage } from 'vj/misc/Page';
import Navigation from 'vj/components/navigation';
import { ActionDialog } from 'vj/components/dialog';
import loadReactRedux from 'vj/utils/loadReactRedux';
import delay from 'vj/utils/delay';
import i18n from 'vj/utils/i18n';
import request from 'vj/utils/request';
import base64 from 'vj/utils/base64';

class ProblemPageExtender {
  constructor() {
    this.isExtended = false;
    this.inProgress = false;
    this.$content = $('.problem-content-container');
    this.$contentBound = this.$content.closest('.section');
    this.$scratchpadContainer = $('.scratchpad-container');
  }

  async extend() {
    if (this.inProgress) return;
    if (this.isExtended) return;
    this.inProgress = true;

    const bound = this.$contentBound
      .get(0)
      .getBoundingClientRect();

    this.$content.transition({ opacity: 0 }, { duration: 100 });
    await delay(100);

    Navigation.instance.floating.set('scratchpad', true);
    Navigation.instance.logoVisible.set('scratchpad', true);
    Navigation.instance.expanded.set('scratchpad', true);
    $('body').addClass('header--collapsed mode--scratchpad');
    await this.$scratchpadContainer
      .css({
        left: bound.left,
        top: bound.top,
        width: bound.width,
        height: bound.height,
      })
      .show()
      .transition({
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
      }, {
        duration: 500,
        easing: 'easeOutCubic',
      })
      .promise();

    $('.main > .row').hide();
    $('.footer').hide();
    $(window).scrollTop(0);

    this.inProgress = false;
    this.isExtended = true;
  }

  async collapse() {
    if (this.inProgress) return;
    if (!this.isExtended) return;
    this.inProgress = true;

    $(window).scrollTop(0);
    $('.main > .row').show();
    $('.footer').show();

    const bound = this.$contentBound
      .get(0)
      .getBoundingClientRect();

    Navigation.instance.floating.set('scratchpad', false);
    Navigation.instance.logoVisible.set('scratchpad', false);
    Navigation.instance.expanded.set('scratchpad', false);

    $('body').removeClass('header--collapsed mode--scratchpad');

    await this.$scratchpadContainer
      .transition({
        left: bound.left,
        top: bound.top,
        width: bound.width,
        height: bound.height,
      }, {
        duration: 500,
        easing: 'easeOutCubic',
      })
      .promise();

    this.$scratchpadContainer.hide();
    this.$content.transition({ opacity: 1 }, { duration: 100 });

    this.inProgress = false;
    this.isExtended = false;
  }

  toggle() {
    if (this.isExtended) this.collapse();
    else this.extend();
  }
}

const page = new NamedPage(['problem_detail', 'contest_detail_problem', 'homework_detail_problem'], () => {
  let reactLoaded = false;
  let renderReact = null;
  let unmountReact = null;
  const extender = new ProblemPageExtender();

  const copyProblemDialog = new ActionDialog({
    $body: $('.dialog__body--send-to > div'),
    onDispatch(action) {
      const $target = copyProblemDialog.$dom.find('[name="target"]');
      if (action === 'ok' && $target.val() === '') {
        $target.focus();
        return false;
      }
      return true;
    },
  });
  copyProblemDialog.clear = function () {
    this.$dom.find('[name="target"]').val('');
    return this;
  };

  async function handleClickCopyProblem() {
    const action = await copyProblemDialog.clear().open();
    if (action !== 'ok') return;
    const target = copyProblemDialog.$dom.find('[name="target"]').val();
    try {
      await request.post(UiContext.postCopyUrl, {
        operation: 'send',
        target,
        pids: [UiContext.problemNumId],
      });
      Notification.send(i18n('Problem Sended.'));
    } catch (error) {
      Notification.error(error.message);
    }
  }

  async function scratchpadFadeIn() {
    await $('#scratchpad')
      .transition({
        opacity: 1,
      }, {
        duration: 200,
        easing: 'easeOutCubic',
      })
      .promise();
  }

  async function scratchpadFadeOut() {
    await $('#scratchpad')
      .transition({
        opacity: 0,
      }, {
        duration: 200,
        easing: 'easeOutCubic',
      })
      .promise();
  }

  async function loadReact() {
    if (reactLoaded) return;
    $('.loader-container').show();

    const { default: SockJs } = await import('../components/socket');
    const { default: ScratchpadApp } = await import('../components/scratchpad');
    const { default: ScratchpadReducer } = await import('../components/scratchpad/reducers');
    const {
      React, render, unmountComponentAtNode, Provider, store,
    } = await loadReactRedux(ScratchpadReducer);

    const sock = new SockJs(UiContext.pretestConnUrl);
    sock.onmessage = (message) => {
      const msg = JSON.parse(message.data);
      store.dispatch({
        type: 'SCRATCHPAD_RECORDS_PUSH',
        payload: msg,
      });
    };

    renderReact = () => {
      render(
        <Provider store={store}>
          <ScratchpadApp />
        </Provider>,
        $('#scratchpad').get(0),
      );
    };
    unmountReact = () => {
      unmountComponentAtNode($('#scratchpad').get(0));
    };
    reactLoaded = true;
    $('.loader-container').hide();
  }

  async function enterScratchpadMode() {
    await extender.extend();
    await loadReact();
    renderReact();
    await scratchpadFadeIn();
  }

  async function leaveScratchpadMode() {
    await scratchpadFadeOut();
    $('.problem-content-container').append($('.problem-content'));
    await extender.collapse();
    unmountReact();
  }

  async function loadSubjective() {
    try {
      const props = yaml.load(base64.decode(document.getElementsByClassName('section__body typo')[0].innerText));
      $('.loader-container').show();
      const { default: Subjective } = await import('vj/components/subjective-question/index');
      const React = await import('react');
      const ReactDOM = await import('react-dom');

      ReactDOM.render(
        <div className="section__body typo">
          <Subjective panel={props}></Subjective>
        </div>,
        $('.problem-content').get(0),
      );
      $('.loader-container').hide();
      // eslint-disable-next-line no-empty
    } catch (e) {
      console.error(e);
    }
  }

  $(document).on('click', '[name="problem-sidebar__open-scratchpad"]', (ev) => {
    enterScratchpadMode();
    ev.preventDefault();
  });
  $(document).on('click', '[name="problem-sidebar__quit-scratchpad"]', (ev) => {
    leaveScratchpadMode();
    ev.preventDefault();
  });
  $(document).on('click', '[name="problem-sidebar__show-category"]', (ev) => {
    $(ev.currentTarget).hide();
    $('[name="problem-sidebar__categories"]').show();
  });
  $('[name="problem-sidebar__send-to"]').click(() => handleClickCopyProblem());
  loadSubjective();
});

export default page;
