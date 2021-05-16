import Clipboard from 'clipboard';
import * as echarts from 'echarts';
import moment from 'moment-timezone';
import { NamedPage } from 'vj/misc/Page';
import substitute from 'vj/utils/substitute';
import Notification from 'vj/components/notification';
import i18n from 'vj/utils/i18n';
import base64 from 'vj/utils/base64';
import request from 'vj/utils/request';

const page = new NamedPage('user_detail', async () => {
  $('[name="profile_contact_copy"]').get().forEach((el) => {
    const data = $(el).attr('data-content');
    const decoded = base64.decode(data);
    const clip = new Clipboard(el, { text: () => decoded });
    clip.on('success', () => {
      Notification.success(substitute(i18n('"{data}" copied to clipboard!'), { data: decoded }), 2000);
    });
    clip.on('error', () => {
      Notification.error(substitute(i18n('Copy "{data}" failed :('), { data: decoded }));
    });
  });
  const data = await request.get('');
  const history = data.udoc?.ratingHistory || [];
  while (history.length > 30) history.shift();
  while (history.length < 30) history.unshift(1500);
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
    xAxis: { data: history.map((x, i) => moment().add(-30 + i, 'days').fromNow()) },
    yAxis: { type: 'category' },
    toolbox: {
      right: 10,
      feature: {
        dataZoom: { yAxisIndex: 'none' },
        restore: {},
        saveAsImage: {},
      },
    },
    dataZoom: [{ type: 'inside' }],
    visualMap: {
      show: false,
      pieces: [{
        lte: 1000,
        color: '#AC3B2A',
      }, {
        gt: 1000,
        lte: 1200,
        color: '#AA069F',
      }, {
        gt: 1200,
        lte: 1400,
        color: '#FD0100',
      }, {
        gt: 1400,
        lte: 1600,
        color: '#FC7D02',
      }, {
        gt: 1600,
        lte: 1900,
        color: '#FBDB0F',
      }, {
        gt: 1900,
        color: '#93CE07',
      }],
      outOfRange: {
        color: '#999',
      },
    },
    series: {
      name: 'Rating',
      type: 'line',
      data: history.map((i) => Math.floor(i)),
    },
  });
});

export default page;
