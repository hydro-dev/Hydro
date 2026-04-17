import 'flatpickr/dist/flatpickr.min.css';

import flatpickr from 'flatpickr';
import $ from 'jquery';
import { AutoloadPage } from 'vj/misc/Page';

function padTwo(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function initTimePicker(input: HTMLInputElement) {
  const $input = $(input);
  const interval = 15;
  const $wrapper = $('<div>').css({ position: 'relative', display: 'inline-block', width: '100%' });
  $input.wrap($wrapper);

  const $dropdown = $('<div>').css({
    position: 'absolute',
    top: $input.outerHeight(),
    left: 0,
    right: 0,
    maxHeight: 0,
    overflowY: 'auto',
    background: 'var(--bg-color, #fff)',
    border: '1px solid #ccc',
    borderTop: 'none',
    borderRadius: '0 0 4px 4px',
    zIndex: 1000,
    opacity: 0,
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    transition: 'max-height .2s ease, opacity .2s ease',
    pointerEvents: 'none',
  }).addClass('time-picker-dropdown');

  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += interval) {
      const time = `${padTwo(h)}:${padTwo(m)}`;
      const $item = $('<div>').text(time).css({
        padding: '6px 12px',
        cursor: 'pointer',
      }).on('mousedown', (e) => {
        e.preventDefault();
        $input.val(time).trigger('change');
        closeDropdown(); // eslint-disable-line no-use-before-define
      }).on('mouseenter', function () {
        $(this).css('background', 'var(--highlight-color, #e8f0fe)');
      }).on('mouseleave', function () {
        $(this).css('background', '');
      });
      $dropdown.append($item);
    }
  }

  let isOpen = false;

  function openDropdown() {
    if (isOpen) return;
    isOpen = true;
    $dropdown.css({ maxHeight: '200px', opacity: 1, pointerEvents: 'auto' });
    const val = $input.val() as string;
    if (val) {
      $dropdown.children().each(function cb() {
        if ($(this).text() !== val) return;
        const el = this as HTMLElement;
        el.parentElement!.scrollTop = el.offsetTop - el.parentElement!.offsetTop - 80;
      });
    }
  }

  function closeDropdown() {
    if (!isOpen) return;
    isOpen = false;
    $dropdown.css({ maxHeight: 0, opacity: 0, pointerEvents: 'none' });
  }

  $input.after($dropdown);
  $input.on('focus', openDropdown);
  // Only close when the element actually loses focus within the page,
  // not when the whole window loses focus (alt-tab)
  $input.on('blur', () => {
    if (document.hasFocus()) closeDropdown();
  });
}

const datepickerPage = new AutoloadPage('datepickerPage', async () => {
  $('[data-pick-date]').each(function () {
    flatpickr(this, { allowInput: true });
  });
  $('[data-pick-time]').each(function () {
    initTimePicker(this as HTMLInputElement);
  });
});

export default datepickerPage;
