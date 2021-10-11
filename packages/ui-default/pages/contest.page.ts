import NProgress from 'nprogress';
import { NamedPage } from 'vj/misc/Page';

export default new NamedPage(['contest_detail', 'contest_detail_problem'], () => {
  const beginAt = new Date(UiContext.tdoc.beginAt).getTime();
  const endAt = new Date(UiContext.tdoc.endAt).getTime();
  NProgress.configure({ trickle: false, showSpinner: false, minimum: 0 });
  function updateProgress() {
    const now = Date.now();
    console.log(now, beginAt, endAt);
    if (beginAt <= now && now <= endAt) NProgress.set((now - beginAt) / (endAt - beginAt));
    else if (now > endAt) NProgress.set(1);
    else {
      console.log('set');
      NProgress.set(0);
    }
  }
  NProgress.start();
  updateProgress();
  setInterval(updateProgress, 5000);
});
