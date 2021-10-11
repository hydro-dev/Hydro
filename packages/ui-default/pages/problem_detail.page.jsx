import yaml from 'js-yaml';
import { getScoreColor } from '@hydrooj/utils/lib/status';
import { NamedPage } from 'vj/misc/Page';
import { downloadProblemSet } from 'vj/components/zipDownloader';
import loadReactRedux from 'vj/utils/loadReactRedux';
import delay from 'vj/utils/delay';

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

  async function handleClickDownloadProblem() {
    await downloadProblemSet([UiContext.problemNumId], UiContext.pdoc.title);
  }

  async function scratchpadFadeIn() {
    await $('#scratchpad')
      .transition(
        { opacity: 1 },
        { duration: 200, easing: 'easeOutCubic' },
      )
      .promise();
  }

  async function scratchpadFadeOut() {
    await $('#scratchpad')
      .transition(
        { opacity: 0 },
        { duration: 200, easing: 'easeOutCubic' },
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

  async function loadObjective() {
    try {
      let s = '';
      try {
        s = JSON.parse(UiContext.pdoc.content);
      } catch {
        s = UiContext.pdoc.content;
      }
      if (typeof s === 'object') {
        const langs = Object.keys(s);
        const f = langs.filter((i) => i.startsWith(UserContext.viewLang));
        if (s[UserContext.viewLang]) s = s[UserContext.viewLang];
        else if (f.length) s = s[f[0]];
        else s = s[langs[0]];
      }
      const props = yaml.load(s);
      if (!(props instanceof Array)) return;
      $('.outer-loader-container').show();
      const [{ default: Objective }, React, ReactDOM] = await Promise.all([
        import('vj/components/objective-question/index'),
        import('react'),
        import('react-dom'),
      ]);

      ReactDOM.render(
        <div className="section__body typo">
          <Objective panel={props} target={UiContext.postSubmitUrl}></Objective>
        </div>,
        $('.problem-content').get(0),
      );
      $('.outer-loader-container').hide();
    } catch (e) { }
  }

  async function initChart() {
    if (!Object.keys(UiContext.pdoc.stats || {}).length) {
      $('#submission-status-placeholder').parent().hide();
      return;
    }
    const echarts = await import('echarts');
    const $status = document.getElementById('submission-status-placeholder');
    const statusChart = echarts.init($status);
    statusChart.setOption({
      tooltip: { trigger: 'item' },
      series: [
        {
          name: 'Submissions',
          type: 'pie',
          radius: '70%',
          label: { show: false },
          labelLine: { show: false },
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
  }

  $(document).on('click', '[name="problem-sidebar__open-scratchpad"]', (ev) => {
    enterScratchpadMode();
    ev.preventDefault();
  });
  $(document).on('click', '[name="problem-sidebar__quit-scratchpad"]', (ev) => {
    leaveScratchpadMode();
    ev.preventDefault();
  });

  $(document).on('click', '[name="show_tags"]', (ev) => {
    $(ev.currentTarget).hide();
    $('span.tags').css('display', 'inline-block');
  });
  $('[name="problem-sidebar__download').on('click', handleClickDownloadProblem);
  if (UiContext.pdoc.config?.type === 'objective') loadObjective();
  if (pagename !== 'contest_detail_problem') initChart();
});

export default page;
