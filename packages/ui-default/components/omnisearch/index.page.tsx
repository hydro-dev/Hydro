import { debounce } from 'lodash';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { STATUS_CODES } from 'vj/constant/record';
import { AutoloadPage } from 'vj/misc/Page';
import {
  api, i18n, request,
} from 'vj/utils';

export default new AutoloadPage('omnibar', () => {
  if (document.documentElement.dataset.layout !== 'basic') return;
  const $search = $(`
    <div class='omnibar' data-hotkey="esc:click" style="opacity:0;display:none;">
      <div class='omnibar-main'>
        <div>
          <input placeholder="Search" />
          <span class="icon icon-search"></span>
        </div>
        <div id='omnibar-content'></div>
      </div>
    </div>
  `);
  const $entry = $(`
    <button class="omnibar-toggle" data-global-hotkey="ctrl+k:click">
      <span class="icon icon-search"></span>
    </button>
  `);
  $(document.body).append($search);
  $(document.body).append($entry);
  const $input = $('.omnibar input') as JQuery<HTMLInputElement>;

  const prefix = window.location.pathname.startsWith('/d/') ? `/d/${UiContext.domainId}` : '';
  let setSearching;
  let pdocs = [];
  let psdict = {};
  let udocs = [];
  function SearchResult() {
    const [searching, set] = React.useState(false);
    setSearching = set;
    return (
      <>
        {searching && <div>Searching...</div>}
        {pdocs.length > 0 && <div className="omnibar-content-title">{i18n('Problems')}</div>}
        {pdocs.map((i) => ({ ...i, base: i.domainId !== UiContext.domainId ? `/d/${i.domainId}` : prefix })).map(({
          domainId, docId, pid, title, nSubmit, nAccept, base,
        }) => (
          <a
            key={domainId + docId}
            className="omnibar-content-section omnibar-problem"
            href={`${base}/p/${pid || docId}`}
          >
            <div>
              <p
                onClick={(ev) => {
                  if (psdict[`${domainId}#${docId}`]?.rid) {
                    window.location.href = `${base}/record/${psdict[`${domainId}#${docId}`]?.rid}`;
                  }
                  ev.preventDefault();
                }}
                className={`record-status--text ${STATUS_CODES[psdict[`${domainId}#${docId}`]?.status]}`}
              >
                <span className={`icon record-status--icon ${STATUS_CODES[psdict[`${domainId}#${docId}`]?.status]}`}></span>
              </p>
              <div>{title}</div>
            </div>
            <div>
              <span className="icon icon-book" />{domainId !== UiContext.domainId ? `${domainId}#` : ''}{pid || docId}
              <span className="icon icon-pie-chart" />{nAccept}/{nSubmit}
            </div>
          </a>
        ))}
        {udocs.length > 0 && <div className="omnibar-content-title">{i18n('Users')}</div>}
        {udocs.map(({
          _id, uname, avatarUrl,
        }) => (
          <a key={_id} className="omnibar-content-section omnibar-user" href={`${prefix}/user/${_id}`}>
            <div>
              <img src={avatarUrl} alt={uname} />
              <div className="omnibar-user-info">
                <span>UID {_id}</span><br />
                <div><span style={{ lineHeight: '20px' }}>{uname}</span></div>
              </div>
            </div>
          </a>
        ))}
      </>
    );
  }
  ReactDOM.createRoot(document.getElementById('omnibar-content')!).render(<SearchResult />);

  async function search(query: string) {
    if (!query?.trim()) {
      pdocs = [];
      setSearching?.(false);
      return;
    }
    setSearching?.(true);
    [{ pdocs, psdict }, udocs] = await Promise.all([
      request.get(`/d/${UiContext.domainId}/p`, { q: query, limit: 10 }),
      api('users', { search: query }, ['_id', 'uname', 'displayName', 'avatarUrl']),
    ]);
    setSearching?.(false);
  }
  $input.on('input', debounce((ev) => search(ev.target.value), 1000));

  let open = false;
  const show = () => {
    $search.show();
    setTimeout(() => {
      $search.css('opacity', '1');
      $input.focus();
    }, 20);
    open = true;
  };
  const hide = () => {
    $search.css('opacity', '0');
    setTimeout(() => $search.hide(), 200);
    open = false;
  };
  $entry.on('click', () => (open ? hide() : show()));
  $input.on('click', (ev) => ev.stopPropagation());
  $('.omnibar-main').on('click', '.omnibar-content-section', (ev) => ev.stopPropagation());
  $search.on('click', hide);
});
