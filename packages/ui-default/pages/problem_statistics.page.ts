import { getScoreColor } from '@hydrooj/utils/lib/status';
import $ from 'jquery';
import { NamedPage } from 'vj/misc/Page';
import { getAvailableLangs, tpl } from 'vj/utils';

const page = new NamedPage('problem_statistics', () => {
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
    if (UiContext.pdoc.config?.type === 'objective') $($status).hide();
  }

  const availableLangs = getAvailableLangs(UiContext.pdoc.config.langs);
  Object.keys(availableLangs).map(
    (i) => ($('select[name="lang"]').append(tpl`<option value="${i}" key="${i}">${availableLangs[i].display}</option>`)));
  const lang = new URL(window.location.href).searchParams.get('lang');
  if (lang) $('select[name="lang"]').val(lang);
  initChart();
  $('[name="filter-form"] select').on('change', () => {
    $('[name="filter-form"]').trigger('submit');
  });
});

export default page;
