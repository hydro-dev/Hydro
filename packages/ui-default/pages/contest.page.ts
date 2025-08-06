import { formatSeconds } from '@hydrooj/utils/lib/common';
import NProgress from 'nprogress';
import { NamedPage } from 'vj/misc/Page';
import { addSpeculationRules, tpl } from 'vj/utils';

const contestTimer = $(tpl`<pre class="contest-timer" style="display:none"></pre>`);
contestTimer.appendTo(document.body);

export default new NamedPage(['contest_detail', 'contest_problemlist', 'contest_detail_problem', 'contest_scoreboard'], () => {
  const beginAt = new Date((UiContext.tdoc.duration && UiContext.tsdoc?.startAt) || UiContext.tdoc.beginAt).getTime();
  const endAt = new Date((UiContext.tdoc.duration && UiContext.tsdoc?.endAt) || UiContext.tdoc.endAt).getTime();
  NProgress.configure({ trickle: false, showSpinner: false, minimum: 0 });
  function updateProgress() {
    const now = Date.now();
    if (beginAt <= now && now <= endAt) {
      NProgress.set((now - beginAt) / (endAt - beginAt));
      contestTimer.show();
      contestTimer.text(formatSeconds(Math.floor((endAt - now) / 1000)));
    } else contestTimer.hide();
  }
  NProgress.start();
  updateProgress();
  setInterval(updateProgress, 1000);

  addSpeculationRules({
    prerender: [{
      where: {
        or: [
          { href_matches: '/p/*' },
          { href_matches: '/d/*/p/*' },
        ],
      },
    }],
  });
});
