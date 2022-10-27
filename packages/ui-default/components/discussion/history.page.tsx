import { Popover } from '@blueprintjs/core';
import React from 'react';
import ReactDOM from 'react-dom/client';
import TimeAgo from 'timeago-react';
import { InfoDialog } from 'vj/components/dialog';
import { AutoloadPage } from 'vj/misc/Page';
import i18n from 'vj/utils/i18n';
import request from 'vj/utils/request';
import tpl from 'vj/utils/tpl';

async function historyDialog(payload, time, uid) {
  const rawHtml = await fetch(`${payload}?time=${new Date(time).getTime()}`).then((res) => res.text());
  new InfoDialog({
    $body: tpl`
      <div class="typo">
        <p><div data-user>${uid}</div> ${i18n('Edited at')} <span class="time relative" data-timestamp="${time / 1000}">${time / 1000}</span></p>
        ${{ templateRaw: true, html: rawHtml }}
      </div>`,
  }).open();
}

function History({ payload }) {
  const [history, updateHistory] = React.useState([]);
  const [loading, updateLoading] = React.useState(true);
  if (loading) {
    try {
      request.get(`${payload}?all=1`).then((res) => updateHistory(res.history), updateLoading(false));
    } catch (e) { updateLoading(false); }
  }
  return (
    <Popover usePortal interactionKind="hover">
      <a>{ i18n('Edited') }</a>
      <ol className="menu">
        {!history.length && <li className="menu__item">{ loading ? 'Loading...' : 'Loading failed.' }</li>}
        {history.map((item) => (
          <li className="menu__item" key={item.time}>
            <a className="menu__link" onClick={() => historyDialog(payload, item.time, item.uid)}>
              {i18n('Edited at')}
              {' '}
              <time><TimeAgo datetime={item.time} locale={i18n('timeago_locale')} /></time>
            </a>
          </li>
        ))}
      </ol>
    </Popover>
  );
}

const page = new AutoloadPage('discussionHistoryPage', () => {
  if ($('[data-discussion-history]').length) {
    const rendered = [];
    $(document).on('mouseover', '[data-discussion-history]', (ev) => {
      const $el = $(ev.currentTarget);
      if (rendered.includes($el.data('raw-url'))) return;
      ReactDOM.createRoot($el.get(0)).render(
        <History payload={$el.data('raw-url')} />,
      );
      rendered.push($el.data('raw-url'));
    });
  }
});

export default page;
