import $ from 'jquery';
import _ from 'lodash';
import { AutoloadPage } from 'vj/misc/Page';

const KEY_MAP = {
  10: 'enter',
  13: 'enter',
  27: 'esc',
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down',
  112: 'f1',
  113: 'f2',
  114: 'f3',
  115: 'f4',
  116: 'f5',
  117: 'f6',
  118: 'f7',
  119: 'f8',
  120: 'f9',
  121: 'f10',
  122: 'f11',
  123: 'f12',
};

function isHotkeyMatch(sortedHotkeyArr, hotkeyStr) {
  const hotkeyDefined = hotkeyStr.toLowerCase().split('+');
  return _.isEqual(sortedHotkeyArr, hotkeyDefined.sort());
}

let triggered = false;
function testElementHotkey(hotkey, $element, attr) {
  if (!$element.is(':visible')) return;
  String($element.attr(attr))
    .split(',')
    .forEach((singleDef) => {
      const [defStr, trigger] = singleDef.split(':');
      if (isHotkeyMatch(hotkey, defStr)) {
        triggered = true;
        switch (trigger) {
          case 'submit':
            $element.closest('form').trigger('submit');
            break;
          case undefined:
            $element.trigger('click');
            break;
          default:
            $element.trigger(trigger);
            break;
        }
      }
    });
}

const hotkeyPage = new AutoloadPage('hotkeyPage', () => {
  $(document).on('keydown', (ev) => {
    const hotkey = ['alt', 'ctrl', 'shift'].filter((modifyKey) => ev[`${modifyKey}Key`]);
    if (ev.metaKey && !ev.ctrlKey) {
      hotkey.push('ctrl');
    }
    if (KEY_MAP[ev.which] !== undefined) {
      hotkey.push(KEY_MAP[ev.which]);
    } else {
      hotkey.push(String.fromCharCode(ev.which).toLowerCase());
    }
    hotkey.sort();

    triggered = false;
    // Find all global hotkeys
    $('[data-global-hotkey]').get().forEach((element) => {
      testElementHotkey(hotkey, $(element), 'data-global-hotkey');
    });

    // Find all local hotkeys
    $(ev.target).parents('[data-hotkey]').get().forEach((element) => {
      testElementHotkey(hotkey, $(element), 'data-hotkey');
    });
    if (triggered) ev.preventDefault();
  });
});

export default hotkeyPage;
