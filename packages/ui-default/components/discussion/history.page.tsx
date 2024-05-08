import { Popover } from '@blueprintjs/core';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery } from 'react-query';
import TimeAgo from 'timeago-react';
import { InfoDialog } from 'vj/components/dialog';
import { AutoloadPage } from 'vj/misc/Page';
import { i18n, request, tpl } from 'vj/utils';

async function historyDialog(payload, time, uid) {
  const ts = new Date(time).getTime();
  const rawHtml = await fetch(`${payload}?time=${ts}&render=1`).then((res) => res.text());
  new InfoDialog({
    $body: tpl`
      <div class="typo richmedia">
        <p><div data-user>${uid}</div> ${i18n('Edited at')} <span class="time relative" data-timestamp="${ts / 1000}">${time}</span></p>
        <div style="scroll-behavior: smooth; max-height: 60vh; overflow: auto;">
          ${{ templateRaw: true, html: rawHtml }}
        </div>
      </div>`,
  }).open();
}

const queryClient = new QueryClient();

function History({ payload }) {
  const [load, setLoad] = React.useState(false);
  const { isLoading, isError, data } = useQuery(['history', payload], async () => {
    const { history } = await request.get(`${payload}?all=1`);
    return history;
  }, { enabled: !!load });
  return (
    <Popover
      usePortal
      interactionKind="hover"
      position="bottom"
      onOpening={() => setLoad(true)}
      content={<ol className="menu">
        {(isLoading || isError) && (
          <li className="menu__item">
            <a className="menu__link">
              {isLoading ? i18n('Loading...') : i18n('Loading failed.')}
            </a>
          </li>
        )}
        {data?.map((item) => (
          <li className="menu__item" key={item.time}>
            <a className="menu__link" onClick={() => historyDialog(payload, item.time, item.uid)}>
              {i18n('Edited at')}
              {' '}
              <TimeAgo datetime={item.time} locale={i18n('timeago_locale')} />
            </a>
          </li>
        ))}
      </ol>}
    >
      <span>{i18n('Edited')} <span className="icon icon-expand_more"></span></span>
    </Popover>
  );
}

const page = new AutoloadPage('discussionHistoryPage', () => {
  $('[data-discussion-history]').each((i, e) => {
    const url = $(e).data('raw-url');
    if (!url) return;
    ReactDOM.createRoot(e).render(
      <QueryClientProvider client={queryClient}>
        <History payload={url} />
      </QueryClientProvider>,
    );
  });
});

export default page;
