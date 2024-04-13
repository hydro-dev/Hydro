import $ from 'jquery';
import responsiveCutoff from 'vj/breakpoints.json';
import DomDialog from 'vj/components/dialog/DomDialog';
import { InfoDialog } from 'vj/components/dialog/index';
import { AutoloadPage } from 'vj/misc/Page';
import { i18n, mediaQuery, tpl } from 'vj/utils';

const signinDialogPage = new AutoloadPage('signinDialogPage', null, () => {
  const signInDialog = DomDialog.getOrConstruct($('.dialog--signin'), {
    cancelByClickingBack: true,
    cancelByEsc: true,
  });

  // don't show quick login dialog if in mobile
  if ($('[name="nav_login"]').length > 0) {
    // nav
    $('[name="nav_login"]').on('click', (ev) => {
      if (mediaQuery.isBelow(responsiveCutoff.mobile)) return;
      if (ev.shiftKey || ev.metaKey || ev.ctrlKey) return;
      signInDialog.show();
      ev.preventDefault();
    });
  }

  if ($('.dialog--signin').length > 0) {
    // dialog
    $('[name="dialog--signin__close"]').on('click', () => {
      signInDialog.hide();
    });
  }

  window.showSignInDialog = () => {
    if (mediaQuery.isBelow(responsiveCutoff.mobile)) {
      if ($('[name="nav_login"]').length > 0) {
        window.location.href = $('[name="nav_login"]').attr('href');
        return;
      }
    }
    signInDialog.show();
  };

  $('[data-lostpass]').on('click', (e) => {
    e.preventDefault();
    new InfoDialog({
      $body: tpl.typoMsg(i18n('Relax and try to remember your password.')),
    }).open();
  });
});

export default signinDialogPage;
