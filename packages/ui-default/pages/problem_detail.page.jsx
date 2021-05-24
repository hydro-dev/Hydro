import yaml from 'js-yaml';
import { getScoreColor } from '@hydrooj/utils/lib/status';
import * as echarts from 'echarts';
import { NamedPage } from 'vj/misc/Page';
import Navigation from 'vj/components/navigation';
import Notification from 'vj/components/notification/index';
import { ActionDialog } from 'vj/components/dialog';
import { downloadProblemSet } from 'vj/components/zipDownloader';
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

const page = new NamedPage(['problem_detail', 'contest_detail_problem', 'homework_detail_problem'], async (pagename) => {
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

  async function handleClickDownloadProblem() {
    await downloadProblemSet([UiContext.problemNumId]);
  }

  async function scratchpadFadeIn() {
    await $('#scratchpad')
      .transition(
        { opacity: 1 },
        { duration: 200, easing: 'easeOutCubic' }
      )
      .promise();
  }

  async function scratchpadFadeOut() {
    await $('#scratchpad')
      .transition(
        { opacity: 0 },
        { duration: 200, easing: 'easeOutCubic' }
      )
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
      if (!(props instanceof Array)) return;
      $('.outer-loader-container').show();
      const { default: Subjective } = await import('vj/components/subjective-question/index');
      const React = await import('react');
      const ReactDOM = await import('react-dom');

      ReactDOM.render(
        <div className="section__body typo">
          <Subjective panel={props} target={UiContext.postSubmitUrl}></Subjective>
        </div>,
        $('.problem-content').get(0),
      );
      $('.outer-loader-container').hide();
    } catch (e) { }
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
  $('[name="problem-sidebar__download').on('click', handleClickDownloadProblem);
  loadSubjective();

  if (pagename === 'contest_detail_problem') return;
  if (!Object.keys(UiContext.pdoc.stats || {}).length) {
    $('#submission-status-placeholder').parent().hide();
    return;
  }
  const $status = document.getElementById('submission-status-placeholder');
  const statusChart = echarts.init($status);
  statusChart.setOption({
    tooltip: { trigger: 'item' },
    series: [
      {
        name: 'Submissions',
        type: 'pie',
        radius: [10, 70],
        roseType: 'radius',
        data: [
          { value: UiContext.pdoc.stats.TLE, name: 'TLE' },
          { value: UiContext.pdoc.stats.AC, name: 'AC' },
          { value: UiContext.pdoc.stats.MLE, name: 'MLE' },
          { value: UiContext.pdoc.stats.WA, name: 'WA' },
          { value: UiContext.pdoc.stats.RE, name: 'RE' },
          { value: UiContext.pdoc.stats.CE, name: 'CE' },
          { value: UiContext.pdoc.stats.SE, name: 'SE' },
          { value: UiContext.pdoc.stats.IGN, name: 'IGN' },
        ],
      },
    ],
  });
  const $score = document.getElementById('submission-score-placeholder');
  const x = Array.from({ length: 101 }, (v, i) => i).filter((i) => UiContext.pdoc.stats[`s${i}`]);
  const scoreChart = echarts.init($score);
  scoreChart.setOption({
    tooltip: { trigger: 'item' },
    xAxis: { data: x },
    yAxis: {},
    series: [{
      data: x.map((i) => ({
        value: UiContext.pdoc.stats[`s${i}`],
        itemStyle: { color: getScoreColor(i) },
      })),
      type: 'bar',
    }],
  });
});

export default page;
