import Clipboard from 'clipboard';
import * as timeago from 'timeago.js';
import { NamedPage } from 'vj/misc/Page';
import substitute from 'vj/utils/substitute';
import Notification from 'vj/components/notification';
import i18n from 'vj/utils/i18n';
import base64 from 'vj/utils/base64';

async function initChart() {
  const history = UiContext.udoc?.ratingHistory || [];
  while (history.length > 30) history.shift();
  while (history.length < 30) history.unshift(1500);
  const echarts = await import('echarts');
  const $dom = document.getElementById('rating-placeholder');
  const chart = echarts.init($dom, undefined);
  chart.setOption({
    title: {
      text: 'Rating',
      left: '1%',
    },
    tooltip: { trigger: 'axis' },
    grid: {
      left: '5%',
      right: '1%',
      bottom: '10%',
    },
    xAxis: { data: history.map((x, i) => timeago.format(new Date().getTime() + (-30 + i) * 1000 * 3600 * 24, i18n('timeago_locale'))) },
    yAxis: { type: 'value', scale: true },
    toolbox: {
      right: 10,
      feature: {
        restore: {},
        saveAsImage: {},
      },
    },
    visualMap: {
      show: false,
      pieces: [{
        lte: 2000,
        color: '#AC3B2A',
      }, {
        gt: 2000,
        lte: 4000,
        color: '#AA069F',
      }, {
        gt: 4000,
        lte: 7000,
        color: '#FD0100',
      }, {
        gt: 7000,
        lte: 12000,
        color: '#FC7D02',
      }, {
        gt: 12000,
        lte: 18000,
        color: '#FBDB0F',
      }, {
        gt: 18000,
        color: '#93CE07',
      }],
      outOfRange: { color: '#999' },
    },
    series: {
      name: 'Rating',
      type: 'line',
      data: history.map((i) => Math.floor(i)),
    },
  });
}

const page = new NamedPage('user_detail', () => {
  $('[data-copy]').get().forEach((el) => {
    const data = $(el).attr('data-copy');
    const decoded = base64.decode(data);
    const clip = new Clipboard(el, { text: () => decoded });
    clip.on('success', () => {
      Notification.success(substitute(i18n('"{data}" copied to clipboard!'), { data: decoded }), 2000);
    });
    clip.on('error', () => {
      Notification.error(substitute(i18n('Copy "{data}" failed :('), { data: decoded }));
    });
  });
  initChart();
  window.onresize = initChart;
});

export default page;
