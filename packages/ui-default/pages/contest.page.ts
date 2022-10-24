import { formatSeconds } from '@hydrooj/utils/lib/common';
import NProgress from 'nprogress';
import { NamedPage } from 'vj/misc/Page';
import tpl from 'vj/utils/tpl';

const contestTimer = $(tpl`<pre class="contest-timer" style="display:none"></pre>`);
contestTimer.appendTo(document.body);

export default new NamedPage(['contest_detail', 'contest_detail_problem', 'contest_scoreboard'], () => {
  const beginAt = new Date(UiContext.tdoc.beginAt).getTime();
  const endAt = new Date(UiContext.tdoc.endAt).getTime();
  NProgress.configure({ trickle: false, showSpinner: false, minimum: 0 });
  let progressTimer;
  function updateProgress() {
    const now = Date.now();
    if (beginAt <= now && now <= endAt) {
      NProgress.set((now - beginAt) / (endAt - beginAt));
      contestTimer.show();
      contestTimer.text(formatSeconds(Math.floor((endAt - now) / 1000)));
    } else {
      if (now > endAt) NProgress.set(1);
      else NProgress.set(0);
      contestTimer.hide();
      clearInterval(progressTimer);
    }
  }
  NProgress.start();
  updateProgress();
  progressTimer = setInterval(updateProgress, 1000);
});
