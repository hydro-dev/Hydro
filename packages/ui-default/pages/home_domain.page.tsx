import $ from 'jquery';
import { prompt } from 'vj/components/dialog';
import { NamedPage } from 'vj/misc/Page';
import { i18n } from 'vj/utils';

export default new NamedPage('home_domain', () => {
  $(document).on('click', '[id="join-domain-button"]', async () => {
    const res = await prompt(i18n('Join Domain'), {
      domain: {
        type: 'domain',
        label: i18n('Domain ID'),
        required: true,
        autofocus: true,
      },
    }, {
      cancelByClickingBack: true,
      cancelByEsc: true,
    });
    if (!res?.domain) return;
    window.location.href = `/domain/join?target=${encodeURIComponent(res.domain.toString())}`;
  });
});
