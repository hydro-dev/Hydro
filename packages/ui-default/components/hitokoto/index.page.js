import { AutoloadPage } from 'vj/misc/Page';
import request from 'vj/utils/request';
import i18n from 'vj/utils/i18n';
import tpl from 'vj/utils/tpl';

const hitokotoPage = new AutoloadPage('hitokotoPage', () => {
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
  $(document).on('vjContentNew', (e) => {
    const elem = $(e.target).find('[name="hitokoto"]');
    if (elem.get) getHitokoto(elem);
  });
});

export default hitokotoPage;
