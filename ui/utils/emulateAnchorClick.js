/**
 *
 * @param {Event} ev
 * @param {String} targetUrl
 * @param {Boolean} alwaysOpenInNewWindow
 */
export default function emulateAnchorClick(ev, targetUrl, alwaysOpenInNewWindow = false) {
  let openInNewWindow;
  if (alwaysOpenInNewWindow) {
    openInNewWindow = true;
  } else {
    openInNewWindow = (ev.ctrlKey || ev.shiftKey || ev.metaKey);
  }
  if (openInNewWindow) {
    window.open(targetUrl);
  } else {
    window.location.href = targetUrl;
  }
}
