import yaml from 'js-yaml';
import { createRoot } from 'react-dom/client';
import React from 'react';
import { getScoreColor } from '@hydrooj/utils/lib/status';
import { NamedPage } from 'vj/misc/Page';
import { downloadProblemSet } from 'vj/components/zipDownloader';
import loadReactRedux from 'vj/utils/loadReactRedux';
import delay from 'vj/utils/delay';
import pjax from 'vj/utils/pjax';
import request from 'vj/utils/request';

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
    window.document.body.style.overflow = 'hidden';

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
    window.document.body.style.overflow = 'scroll';

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

    const { default: WebSocket } = await import('../components/socket');
    const { default: ScratchpadApp } = await import('../components/scratchpad');
    const { default: ScratchpadReducer } = await import('../components/scratchpad/reducers');
    const { Provider, store } = await loadReactRedux(ScratchpadReducer);

    const sock = new WebSocket(UiContext.pretestConnUrl);
    sock.onmessage = (message) => {
      const msg = JSON.parse(message.data);
      store.dispatch({
        type: 'SCRATCHPAD_RECORDS_PUSH',
        payload: msg,
      });
    };

    const root = createRoot($('#scratchpad').get(0));
    renderReact = () => {
      root.render(
        <Provider store={store}>
          <ScratchpadApp />
        </Provider>,
      );
    };
    unmountReact = () => root.unmount();
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
    $('.outer-loader-container').show();
    const ans = {};
    let objNum = 0;
    const reg = /{{ (input|select|multiselect)\(\d+(-\d+)?\) }}/g;
    $('.problem-content .typo').children().each((i, e) => {
      if (e.tagName === 'PRE' && !e.children[0].className.includes('#input')) return;
      const objQuestions = [];
      let objQuestion = reg.exec(e.innerText);
      while (objQuestion != null) {
        objQuestions.push(objQuestion);
        objQuestion = reg.exec(e.innerText);
      }
      objQuestions.forEach((obj) => {
        objNum++;
        const [objData, objType] = obj;
        const objID = objData.replace(/{{ (input|select|multiselect)\((\d+(-\d+)?)\) }}/, '$2');
        if (objType === 'input') {
          $(e).html($(e).html().replace(objData, `
            <div class="objective_${objID} medium-3" style="display: inline-block;">
              <input type="text" placeholder="Question${objNum} ${objID}" name="${objID}" class="textbox objective-input">
            </div>
          `));
        } else if (objType === 'select') {
          $(e).html($(e).html().replace(objData, `Question${objNum}_${objID}:`));
          $(e).next('ul').children().each((j, ele) => {
            $(ele).after(`
              <div class="objective_${objID} radiobox">
                <input type="radio" name="${objID}" class="objective-input" value="${String.fromCharCode(65 + j)}">
                ${String.fromCharCode(65 + j)}. ${ele.innerHTML}
              </div>`);
            $(ele).remove();
          });
        } else if (objType === 'multiselect') {
          $(e).html($(e).html().replace(objData, `Question${objNum}_${objID}:`));
          $(e).next('ul').children().each((j, ele) => {
            $(ele).after(`
              <div class="objective_${objID} radiobox">
                <input type="checkbox" name="${objID}" class="objective-input" value="${String.fromCharCode(65 + j)}">
                ${String.fromCharCode(65 + j)}. ${ele.innerHTML}
              </div>
            `);
            $(ele).remove();
          });
        }
      });
    });
    if (objNum) {
      $('.problem-content .typo').append(document.getElementsByClassName('nav__item--round').length
        ? '<input type="submit" disabled class="button rounded primary" value="登录后提交" />'
        : '<input type="submit" class="button rounded primary" value="提交" />');
      $('input.objective-input').on('input', (e) => {
        ans[e.target.name] = e.target.value;
      });
      $('input[type="submit"]').on('click', (e) => {
        e.preventDefault();
        request
          .post(`${window.location.href}/submit`, {
            lang: '_',
            code: yaml.dump(ans),
          })
          .then((res) => {
            window.location.href = res.url;
          })
          .catch((err) => {
            Notification.error(err.message);
          });
      });
    }
    $('.outer-loader-container').hide();
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

    window.onresize = function () {
      statusChart.resize();
      scoreChart.resize();
    };
  }

  $(document).on('click', '[name="problem-sidebar__open-scratchpad"]', (ev) => {
    enterScratchpadMode();
    ev.preventDefault();
  });
  $(document).on('click', '[name="problem-sidebar__quit-scratchpad"]', (ev) => {
    leaveScratchpadMode();
    ev.preventDefault();
  });

  $(document).on('click', '[data-lang]', (ev) => {
    ev.preventDefault();
    const url = new URL(window.location.href);
    url.searchParams.set('lang', ev.currentTarget.dataset.lang);
    $('[data-lang]').removeClass('tab--active');
    pjax.request({ url: url.toString() });
    $(ev.currentTarget).addClass('tab--active');
  });
  $(document).on('click', '[name="show_tags"]', (ev) => {
    $(ev.currentTarget).hide();
    $('span.tags').css('display', 'inline-block');
  });
  $('[name="problem-sidebar__download"]').on('click', handleClickDownloadProblem);
  const { type } = UiContext.pdoc.config || {};
  if (type === 'objective') loadObjective();
  if (pagename !== 'contest_detail_problem') initChart();
});

export default page;
