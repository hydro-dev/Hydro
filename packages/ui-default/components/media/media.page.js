import $ from 'jquery';
import { AutoloadPage } from 'vj/misc/Page';
import { request } from 'vj/utils';

export default new AutoloadPage('media', async () => {
  async function parseMedia($dom = $(document.body)) {
    const items = [];
    const resolvers = [];
    const users = $dom.find('div[data-user]');
    const resolve = (ele, item) => {
      items.push(item);
      resolvers.push((html) => html && $(ele).replaceWith($(html)));
    };
    users.get().forEach((ele) => resolve(ele, { type: 'user', id: +$(ele).text() }));
    $dom.find('.typo').addBack('.typo').get().forEach((el) => {
      if (el.className.includes('no-media')) return;
      $(el).find('a[href]').get().forEach((ele) => {
        if ($(ele).parent().hasClass('user-profile-link')) return;
        let target = $(ele).attr('href');
        let { domainId } = UiContext;
        if (target.startsWith(UiContext.url_prefix)) {
          target.replace(UiContext.url_prefix, '');
          if (!target.startsWith('/')) target = `/${target}`;
        }
        if (!target.startsWith('/') || target.startsWith('//')) return;
        if (target.startsWith('/d/')) {
          const [, , domain, ...extra] = target.split('/');
          domainId = domain;
          target = `/${extra.join('/')}`;
        }
        const [, category, data, extra] = target.split('/');
        if (!data) return;
        if (category === 'user' && Number.isInteger(+data) && !extra) resolve(ele, { type: 'user', id: +data });
        if (category === 'p' && !extra) resolve(ele, { type: 'problem', id: data, domainId });
        if (category === 'contest' && !extra) resolve(ele, { type: 'contest', id: data, domainId });
        if (category === 'homework' && !extra) resolve(ele, { type: 'homework', id: data, domainId });
      });
    });
    if (!items.length) return;
    const res = await request.post(`/d/${UiContext.domainId}/media`, { items });
    for (let i = 0; i < res.length; i++) resolvers[i](res[i]);
  }

  await parseMedia();
  $(document).on('vjContentNew', (e) => parseMedia($(e.target)));
});
