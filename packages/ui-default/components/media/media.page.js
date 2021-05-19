import { AutoloadPage } from 'vj/misc/Page';
import request from 'vj/utils/request';

export default new AutoloadPage('media', async () => {
    const items = [];
    const resolvers = [];
    const users = $('div[data-user]');
    users.get().forEach((ele) => {
        items.push({ type: 'user', id: $(ele).text() });
        resolvers.push((html) => $(ele).replaceWith($(html)));
    });
    if (!items.length) return;
    const res = await request.post('/media', { items });
    for (let i = 0; i < res.length; i++) resolvers[i](res[i]);
});
