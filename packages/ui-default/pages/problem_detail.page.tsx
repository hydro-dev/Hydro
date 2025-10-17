import $ from 'jquery';
import yaml from 'js-yaml';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { confirm } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { downloadProblemSet } from 'vj/components/zipDownloader';
import { NamedPage } from 'vj/misc/Page';
import {
  delay, i18n, loadReactRedux, pjax, request, tpl,
} from 'vj/utils';
import { openDB } from 'vj/utils/db';

class ProblemPageExtender {
  isExtended = false;
  inProgress = false;
  $content = $('.problem-content-container');
  $contentBound = this.$content.closest('.section');
  $scratchpadContainer = $('.scratchpad-container');

  async extend() {
    if (this.inProgress) return;
    if (this.isExtended) return;
    this.inProgress = true;

    const bound = this.$contentBound
      .get(0)
      .getBoundingClientRect();

    // @ts-ignore
    this.$content.transition({ opacity: 0 }, { duration: 100 });
    await delay(100);

    $('body').addClass('header--collapsed mode--scratchpad');
    await this.$scratchpadContainer
      .css({
        left: bound.left,
        top: bound.top,
        width: bound.width,
        height: bound.height,
      })
      .show()
      .transition({
        // @ts-ignore
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
      }, {
        duration: 500,
        easing: 'easeOutCubic',
      })
      .promise();

    $('.main > .row').hide();
    $('.footer').hide();
    $(window).scrollTop(0);
    window.document.body.style.overflow = 'hidden';

    this.inProgress = false;
    this.isExtended = true;
  }

  async collapse() {
    if (this.inProgress) return;
    if (!this.isExtended) return;
    this.inProgress = true;

    $(window).scrollTop(0);
    $('.main > .row').show();
    $('.footer').show();

    const bound = this.$contentBound
      .get(0)
      .getBoundingClientRect();

    $('body').removeClass('header--collapsed mode--scratchpad');

    await this.$scratchpadContainer
      .transition({
        // @ts-ignore
        left: bound.left,
        top: bound.top,
        width: bound.width,
        height: bound.height,
      }, {
        duration: 500,
        easing: 'easeOutCubic',
      })
      .promise();

    this.$scratchpadContainer.hide();
    // @ts-ignore
    this.$content.transition({ opacity: 1 }, { duration: 100 });
    window.document.body.style.overflow = 'scroll';

    this.inProgress = false;
    this.isExtended = false;
  }

  toggle() {
    if (this.isExtended) this.collapse();
    else this.extend();
  }
}

const page = new NamedPage(['problem_detail', 'contest_detail_problem', 'homework_detail_problem'], async () => {
  let reactLoaded = false;
  let renderReact = null;
  let unmountReact = null;
  const extender = new ProblemPageExtender();

  async function handleClickDownloadProblem() {
    await downloadProblemSet([UiContext.problemNumId], UiContext.pdoc.title);
  }

  async function scratchpadFadeIn() {
    await $('#scratchpad')
      // @ts-ignore
      .transition(
        { opacity: 1 },
        { duration: 200, easing: 'easeOutCubic' },
      )
      .promise();
  }

  async function scratchpadFadeOut() {
    await $('#scratchpad')
      // @ts-ignore
      .transition(
        { opacity: 0 },
        { duration: 200, easing: 'easeOutCubic' },
      )
      .promise();
  }

  async function loadReact() {
    if (reactLoaded) return;
    $('.loader-container').show();

    const { default: WebSocket } = await import('../components/socket');
    const { default: ScratchpadApp } = await import('../components/scratchpad');
    const { default: ScratchpadReducer } = await import('../components/scratchpad/reducers');
    const { Provider, store } = await loadReactRedux(ScratchpadReducer);

    // @ts-ignore
    window.store = store;
    const sock = new WebSocket(UiContext.ws_prefix + UiContext.pretestConnUrl);
    sock.onmessage = (message) => {
      const msg = JSON.parse(message.data);
      store.dispatch({
        type: 'SCRATCHPAD_RECORDS_PUSH',
        payload: msg,
      });
    };

    renderReact = () => {
      const root = createRoot($('#scratchpad').get(0));
      root.render(
        <Provider store={store}>
          <ScratchpadApp />
        </Provider>,
      );
      unmountReact = () => root.unmount();
    };
    reactLoaded = true;
    $('.loader-container').hide();
  }

  let progress = false;

  async function enterScratchpadMode() {
    if (progress) return;
    progress = true;
    await extender.extend();
    await loadReact();
    renderReact();
    await scratchpadFadeIn();
    progress = false;
  }

  async function leaveScratchpadMode() {
    if (progress) return;
    progress = true;
    await scratchpadFadeOut();
    $('.problem-content-container').append($('.problem-content'));
    await extender.collapse();
    unmountReact();
    progress = false;
  }

  async function loadObjective() {
    $('.outer-loader-container').show();
    const ans = {};
    const pids = [];
    let cnt = 0;
    const reg = /\{\{ (input|select|multiselect|textarea)\(\d+(-\d+)?\) \}\}/g;
    $('.problem-content .typo').children().each((i, e) => {
      if (e.tagName === 'PRE' && !e.children[0].className.includes('#input')) return;
      const questions = [];
      let q;
      while (q = reg.exec(e.textContent)) questions.push(q); // eslint-disable-line no-cond-assign
      for (const [info, type] of questions) {
        cnt++;
        const id = info.replace(/\{\{ (input|select|multiselect|textarea)\((\d+(-\d+)?)\) \}\}/, '$2');
        pids.push(id);
        if (type === 'input') {
          $(e).html($(e).html().replace(info, tpl`
            <div class="objective_${id} medium-3" id="p${id}" style="display: inline-block;">
              <input type="text" name="${id}" class="textbox objective-input">
            </div>
          `));
        } else if (type === 'textarea') {
          $(e).html($(e).html().replace(info, tpl`
            <div class="objective_${id} medium-6" id="p${id}">
              <textarea name="${id}" class="textbox objective-input"></textarea>
            </div>
          `));
        } else {
          if ($(e).next()[0]?.tagName !== 'UL') {
            cnt--;
            return;
          }
          $(e).html($(e).html().replace(info, ''));
          $(e).next('ul').children().each((j, ele) => {
            $(ele).after(tpl`
              <label class="objective_${id} radiobox" id="p${id}">
                <input type="${type === 'select' ? 'radio' : 'checkbox'}" name="${id}" class="objective-input" value="${String.fromCharCode(65 + j)}">
                ${String.fromCharCode(65 + j)}. ${{ templateRaw: true, html: ele.innerHTML }}
              </label>
            `);
            $(ele).remove();
          });
        }
      }
    });

    let cacheKey = `${UserContext._id}/${UiContext.pdoc.domainId}/${UiContext.pdoc.docId}`;
    if (UiContext.tdoc?._id && UiContext.tdoc.rule !== 'homework') cacheKey += `@${UiContext.tdoc._id}`;

    let setUpdate;
    const db = await openDB;
    async function saveAns() {
      await db.put('solutions', {
        id: `${cacheKey}#objective`,
        value: JSON.stringify(ans),
      });
    }
    async function clearAns() {
      if (!(await confirm(i18n('All changes will be lost. Are you sure to clear all answers?')))) return;
      await db.delete('solutions', `${cacheKey}#objective`);
      window.location.reload();
    }

    function ProblemNavigation() {
      [, setUpdate] = React.useState(0);
      const update = React.useCallback(() => { setUpdate?.((v) => v + 1); }, []);
      React.useEffect(() => {
        $(document).on('click', update);
        $(document).on('input', update);
        return () => {
          $(document).off('click', update);
          $(document).off('input', update);
        };
      }, [update]);
      return <>
        <div className="contest-problems" style={{ margin: '1em' }}>
          {pids.map((i) => <a href={`#p${i}`} key={i} className={ans[i] ? 'pending ' : ''}>
            <span className="id">{i}</span>
          </a>)}
        </div>
        <li className="menu__item">
          <button className="menu__link" onClick={clearAns}>
            <span className="icon icon-erase" /> {i18n('Clear answers')}
          </button>
        </li>
      </>;
    }

    async function loadAns() {
      const saved = await db.get('solutions', `${cacheKey}#objective`);
      if (typeof saved?.value !== 'string') return;
      const isValidOption = (v) => v.length === 1 && v.charCodeAt(0) >= 65 && v.charCodeAt(0) <= 90;
      Object.assign(ans, JSON.parse(saved?.value || '{}'));
      for (const [id, val] of Object.entries(ans)) {
        if (Array.isArray(val)) {
          for (const v of val) {
            if (isValidOption(v)) $(`.objective_${id} input[value="${v}"]`).prop('checked', true);
          }
        } else if (val) {
          $(`.objective_${id} input[type=text], .objective_${id} textarea`).val(val.toString());
          if (isValidOption(val)) $(`.objective_${id}.radiobox [value="${val}"]`).prop('checked', true);
        }
      }
      setUpdate?.((v) => v + 1);
    }

    if (cnt) {
      await loadAns();
      $('.problem-content .typo').append(document.getElementsByClassName('nav__item--round').length
        ? `<input type="submit" disabled class="button rounded primary disabled" value="${i18n('Login to Submit')}" />`
        : `<input type="submit" class="button rounded primary" value="${i18n('Submit')}" />`);
      $('.objective-input[type!=checkbox]').on('input', (e: JQuery.TriggeredEvent<HTMLInputElement>) => {
        ans[e.target.name] = e.target.value;
        saveAns();
      });
      $('input.objective-input[type=checkbox]').on('input', (e: JQuery.TriggeredEvent<HTMLInputElement>) => {
        if (e.target.checked) {
          ans[e.target.name] ||= [];
          ans[e.target.name].push(e.target.value);
          ans[e.target.name] = [...new Set(ans[e.target.name])].sort((a: string, b: string) => a.charCodeAt(0) - b.charCodeAt(0));
        } else {
          ans[e.target.name] = ans[e.target.name].filter((v) => v !== e.target.value);
        }
        saveAns();
      });
      $('input[type="submit"]').on('click', (e) => {
        e.preventDefault();
        request
          .post(UiContext.postSubmitUrl, {
            lang: '_',
            code: yaml.dump(ans),
          })
          .then((res) => {
            window.location.href = res.url;
          })
          .catch((err) => {
            Notification.error(err.message);
          });
      });
    }
    if (!document.getElementById('problem-navigation')) {
      const ele = document.createElement('div');
      ele.id = 'problem-navigation';
      $('.section--problem-sidebar ol.menu').prepend(ele);
      createRoot(document.getElementById('problem-navigation')).render(<ProblemNavigation />);
    }
    $('.non-scratchpad--hide').hide();
    $('.scratchpad--hide').hide();
    $('.outer-loader-container').hide();
  }

  $(document).on('click', '[name="problem-sidebar__open-scratchpad"]', (ev) => {
    enterScratchpadMode();
    ev.preventDefault();
  });
  $(document).on('click', '[name="problem-sidebar__quit-scratchpad"]', (ev) => {
    leaveScratchpadMode();
    ev.preventDefault();
  });

  $(document).on('click', '[data-lang]', (ev) => {
    ev.preventDefault();
    const url = new URL(window.location.href);
    url.searchParams.set('lang', ev.currentTarget.dataset.lang);
    $('[data-lang]').removeClass('tab--active');
    pjax.request({ url: url.toString() });
    $(ev.currentTarget).addClass('tab--active');
  });
  $(document).on('click', '[name="show_tags"]', (ev) => {
    $(ev.currentTarget).hide();
    $('span.tags').css('display', 'inline-block');
  });
  $('[name="problem-sidebar__download"]').on('click', handleClickDownloadProblem);
  if (UiContext.pdoc.config?.type === 'objective') {
    loadObjective();
    $(document).on('vjContentNew', loadObjective);
  }
});

export default page;
