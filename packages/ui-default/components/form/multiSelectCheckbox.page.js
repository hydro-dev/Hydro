import $ from 'jquery';
import { AutoloadPage } from 'vj/misc/Page';

const lastSelectionByGroup = {};

function isInGroup(group) {
  return (idx, element) => element.getAttribute('data-checkbox-group') === group;
}

function onRangeRoleCheckboxClick(ev) {
  const $current = $(ev.currentTarget);
  const targetGroup = $current.attr('data-checkbox-group');
  const $targets = $('[type="checkbox"]')
    .filter(isInGroup(targetGroup))
    .filter(':visible')
    .filter(':not(:disabled)');
  if (ev.shiftKey && lastSelectionByGroup[targetGroup]) {
    const destCheck = lastSelectionByGroup[targetGroup].prop('checked');
    const from = $targets.index(lastSelectionByGroup[targetGroup]);
    const to = $targets.index($current);
    const start = Math.min(from, to);
    const end = Math.max(from, to) + 1;
    $targets
      .slice(start, end)
      .prop('checked', destCheck);
  }
  lastSelectionByGroup[targetGroup] = $current;
}

function onToggleRoleCheckboxClick(ev) {
  const $current = $(ev.currentTarget);
  const targetGroup = $current.attr('data-checkbox-toggle');
  const $targets = $('[type="checkbox"]')
    .filter(isInGroup(targetGroup))
    .filter(':visible')
    .filter(':not(:disabled)');
  const destCheck = $current.prop('checked');
  $targets.prop('checked', destCheck);
}

const multiSelectCheckboxPage = new AutoloadPage('multiSelectCheckboxPage', () => {
  $(document).on('click', '[data-checkbox-range]', onRangeRoleCheckboxClick);
  $(document).on('click', '[data-checkbox-toggle]', onToggleRoleCheckboxClick);
});

export default multiSelectCheckboxPage;
