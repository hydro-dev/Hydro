import $ from 'jquery';
import { AutoloadPage } from 'vj/misc/Page';

// DOMjudge-style quick navigation:
//   u<uid>Enter      -> /user/<uid>
//   p<pid>Enter      -> /p/<pid>   (e.g. p1000 or pP1234)
//   d<domainId>Enter -> /d/<domainId>
const PATTERNS = {
  u: { re: /^[0-9]+$/, url: (s) => `/user/${s}` },
  p: { re: /^[0-9A-Za-z_-]*$/, url: (s) => `/p/${s}` },
  d: { re: /^[0-9A-Za-z_-]+$/, url: (s) => (s === 'system' ? '/' : `/d/${s}/`) },
};

let buffer = '';
let $hint = null;

function isTyping(target) {
  const $t = $(target);
  return $t.is('input, textarea, select, [contenteditable]')
    || $t.closest('[contenteditable]').length > 0;
}

function renderHint() {
  $hint ||= $('<div class="quicknav-hint"></div>').appendTo(document.body);
  $hint.text(buffer).show();
}

function cancel() {
  buffer = '';
  $hint?.hide();
}

function commit() {
  const type = buffer[0];
  const rest = buffer.slice(1);
  const pattern = PATTERNS[type];
  if (!pattern || !rest || !pattern.re.test(rest)) {
    cancel();
    return;
  }
  const href = pattern.url(rest);
  cancel();
  window.location.href = href;
}

const quicknavPage = new AutoloadPage('quicknavPage', () => {
  $(document).on('keydown', (ev) => {
    if (ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
    if (isTyping(ev.target)) return;
    if (buffer === '' && PATTERNS[ev.key.toLowerCase()]) {
      buffer = ev.key.toLowerCase();
      renderHint();
      ev.preventDefault();
      return;
    }
    if (buffer === '') return;
    if (ev.key === 'Enter') {
      commit();
      ev.preventDefault();
    } else if (ev.key === 'Escape') {
      cancel();
      ev.preventDefault();
    } else if (ev.key === 'Backspace') {
      buffer = buffer.slice(0, -1);
      if (buffer.length <= 0) cancel();
      else renderHint();
      ev.preventDefault();
    } else if (ev.key.length === 1) {
      buffer += ev.key;
      renderHint();
      ev.preventDefault();
    }
  });
});

export default quicknavPage;
