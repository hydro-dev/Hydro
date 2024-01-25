import $ from 'jquery';
import { NamedPage } from 'vj/misc/Page';
import { i18n, request, tpl } from 'vj/utils';

export default new NamedPage('homepage', () => {
  function getHitokoto($containers) {
    $containers.get().forEach((container) => {
      request.get('https://v1.hitokoto.cn?c=a&c=b&c=c&c=d&c=e&c=f')
        .then((hitokoto) => {
          const dom = $(tpl`<p>${hitokoto.hitokoto}</p>`);
          dom.appendTo(container);
        })
        .catch((e) => {
          console.error(e);
          const dom = $(tpl`<p>${i18n('Cannot get hitokoto.')}</p>`);
          dom.appendTo(container);
        });
    });
  }
  if ($('[name="hitokoto"]')) getHitokoto($('[name="hitokoto"]'));
});
