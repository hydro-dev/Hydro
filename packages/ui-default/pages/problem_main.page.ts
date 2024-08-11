import parser, { SearchParserResult } from '@hydrooj/utils/lib/search';
import $ from 'jquery';
import _ from 'lodash';
import DomainSelectAutoComplete from 'vj/components/autocomplete/DomainSelectAutoComplete';
import { ActionDialog, ConfirmDialog, Dialog } from 'vj/components/dialog';
import Dropdown from 'vj/components/dropdown/Dropdown';
import createHint from 'vj/components/hint';
import Notification from 'vj/components/notification';
import { downloadProblemSet } from 'vj/components/zipDownloader';
import { NamedPage } from 'vj/misc/Page';
import {
  addSpeculationRules, delay, i18n, pjax, request, tpl,
} from 'vj/utils';

const list = [];
const filterTags = {};
const pinned: Record<string, string[]> = { category: [], difficulty: [] };
const selections = { category: {}, difficulty: {} };
const selectedTags: Record<string, string[]> = { category: [], difficulty: [] };

function setDomSelected($dom, selected, icon?) {
  if (selected) {
    $dom.addClass('selected');
    if (icon) $dom.append(icon);
  } else {
    $dom.removeClass('selected');
    if (icon) $dom.find('span').remove();
  }
}

const parserOptions = {
  keywords: ['category', 'difficulty'],
  offsets: true,
  alwaysArray: true,
  tokenize: true,
};

function writeSelectionToInput() {
  const currentValue = $('[name="q"]').val() as string;
  const parsedCurrentValue = parser.parse(currentValue, parserOptions) as SearchParserResult;
  const q = parser.stringify({
    ...parsedCurrentValue,
    category: selectedTags.category,
    difficulty: selectedTags.difficulty,
    text: parsedCurrentValue.text,
  }, parserOptions);
  $('[name="q"]').val(q);
}

function updateSelection() {
  selectedTags.category = _.uniq(selectedTags.category);
  for (const type in selections) {
    for (const selection in selections[type]) {
      const item = selections[type][selection];
      const shouldSelect = selectedTags[type].includes(selection);
      const isSelected = (item.$tag || item.$legacy).hasClass('selected');
      let childSelected = false;
      for (const subcategory in item.children) {
        const childShouldSelect = selectedTags[type].includes(subcategory);
        const childIsSelected = item.children[subcategory].$tag.hasClass('selected');
        childSelected ||= childShouldSelect;
        if (childIsSelected !== childShouldSelect) setDomSelected(item.children[subcategory].$tag, childShouldSelect);
      }
      if (item.$legacy) setDomSelected(item.$legacy, (shouldSelect || childSelected));
      if (isSelected !== shouldSelect) {
        if (pinned[type].includes(selection)) {
          setDomSelected(item.$tag, shouldSelect, '<span class="icon icon-check"></span>');
        } else {
          if (item.$tag) setDomSelected(item.$tag, shouldSelect, '<span class="icon icon-close"></span>');
          for (const $element of item.$phantom) {
            if (shouldSelect) $($element).removeClass('hide');
            else $($element).addClass('hide');
          }
        }
      }
    }
  }
}

function loadQuery() {
  const q = $('[name="q"]').val().toString();
  const url = new URL(window.location.href);
  if (!q) url.searchParams.delete('q');
  else url.searchParams.set('q', q);
  url.searchParams.delete('page');
  pjax.request({ url: url.toString() });
}

function handleTagSelected(ev) {
  if (ev.shiftKey || ev.metaKey || ev.ctrlKey) return;
  let [type, selection] = ['category', $(ev.currentTarget).text()];
  if ($(ev.currentTarget).attr('data-selection')) [type, selection] = $(ev.currentTarget).attr('data-selection').split(':');
  const category = $(ev.currentTarget).attr('data-category');
  const filterType = $(ev.currentTarget).attr('data-filter');
  const treeItem = category ? selections[type][category].children[selection] : selections[type][selection];
  const shouldSelect = !(treeItem.$tag || treeItem.$legacy).hasClass('selected');
  if (shouldSelect) {
    if (filterType) selectedTags[type] = _.without(selectedTags[type], ...filterTags[filterType]);
    selectedTags[type].push(selection);
  } else selectedTags[type] = _.without(selectedTags[type], selection, ...(category ? [] : Object.keys(treeItem.children)));
  updateSelection();
  writeSelectionToInput();
  loadQuery();
  ev.preventDefault();
}

function buildLegacyCategoryFilter() {
  const $container = $('[data-widget-cf-container]');
  if (!$container) return;
  $container.attr('class', 'widget--category-filter row small-up-3 medium-up-2');
  for (const category of $container.children('li').get()) {
    const $category = $(category)
      .attr('class', 'widget--category-filter__category column');
    const $categoryTag = $category
      .find('.section__title a')
      .remove()
      .attr('class', 'widget--category-filter__tag');
    const categoryText = $categoryTag.text();
    const $drop = $category
      .children('.chip-list')
      .remove()
      .attr('class', 'widget--category-filter__drop');
    if (selections.category[categoryText]) {
      selections.category[categoryText].$legacy = $categoryTag;
    } else {
      selections.category[categoryText] = {
        $legacy: $categoryTag,
        $tag: null,
        children: {},
        $phantom: [],
      };
    }
    $category.empty().append($categoryTag);
    if ($drop.length > 0) {
      $categoryTag.text(`${$categoryTag.text()}`);
      const $subCategoryTags = $drop
        .children('li')
        .attr('class', 'widget--category-filter__subcategory')
        .find('a')
        .attr('class', 'widget--category-filter__tag')
        .attr('data-category', categoryText);
      for (const subCategoryTag of $subCategoryTags.get()) {
        const $tag = $(subCategoryTag);
        selections.category[categoryText].children[$tag.text()] = {
          $tag,
        };
      }
      Dropdown.getOrConstruct($categoryTag, {
        target: $drop[0],
        position: 'left center',
      });
    }
  }
  list.push(...Object.keys(selections.category));
  list.push(..._.flatMap(Object.values(selections.category), (c: any) => Object.keys(c.children)));
  $(document).on('click', '.widget--category-filter__tag', (ev) => handleTagSelected(ev));
}

function parseCategorySelection() {
  const parsed = parser.parse($('[name="q"]').val() as string || '', parserOptions) as SearchParserResult;
  selectedTags.category = _.uniq(parsed.category || []);
  selectedTags.difficulty = _.uniq(parsed.difficulty || []);
}

function ensureAndGetSelectedPids() {
  const pids = _.map(
    $('tbody [data-checkbox-group="problem"]:checked'),
    (ch) => $(ch).closest('tr').attr('data-pid'),
  );
  if (pids.length === 0) {
    Notification.error(i18n('Please select at least one problem to perform this operation.'));
    return null;
  }
  return pids;
}

async function handleOperation(operation) {
  const pids = ensureAndGetSelectedPids();
  if (pids === null) return;
  const payload: any = {};
  if (operation === 'delete') {
    const action = await new ConfirmDialog({
      $body: tpl.typoMsg(i18n('Confirm to delete the selected problems?')),
    }).open();
    if (action !== 'yes') return;
  } else if (operation === 'copy') {
    $(tpl`
      <div style="display: none" class="dialog__body--problem-copy">
        <div class="row"><div class="columns">
          <h1 name="select_user_hint">${i18n('Copy Problems')}</h1>
        </div></div>
        <div class="row">
          <div class="columns">
            <label>
              ${i18n('Target')}
              <div class="textbox-container">
                <input name="target" type="text" class="textbox" data-autofocus>
              </div>
            </label>
          </div>
        </div>
      </div>
    `).appendTo(document.body);
    const domainSelector: any = DomainSelectAutoComplete.getOrConstruct($('.dialog__body--problem-copy [name="target"]'));
    const copyDialog = await new ActionDialog({
      $body: $('.dialog__body--problem-copy > div'),
      onDispatch(action) {
        if (action === 'ok' && domainSelector.value() === null) {
          domainSelector.focus();
          return false;
        }
        return true;
      },
    }).open();
    if (copyDialog !== 'ok') return;
    const target = $('[name="target"]').val();
    if (!target) return;
    payload.target = target;
  }
  try {
    await request.post('', { operation, pids, ...payload });
    Notification.success(i18n(`Selected problems have been ${operation === 'copy' ? 'copie' : operation}d.`));
    await delay(2000);
    loadQuery();
  } catch (error) {
    Notification.error(error.message);
  }
}

function hideTags(target) {
  for (const i of $(target).find('.problem__tag').get()) {
    if (list.includes(i.children[0].innerHTML)) $(i).addClass('notag--hide');
  }
}

const categoryDialog: any = new Dialog({
  $body: $('.dialog--category-filter > div'),
  cancelByClickingBack: true,
  cancelByEsc: true,
});

categoryDialog.clear = function () {
  const $dataCategoryContainer = this.$dom.find('[data-category-container]');
  $dataCategoryContainer.children().addClass('hide');
  const first = $dataCategoryContainer.children().first();
  setDomSelected(first, true);
  this.$dom.find('[data-subcategory-container]').addClass('hide');
  this.$dom.find(`[data-subcategory-container="${first.attr('data-category')}"]`).removeClass('hide');
  return this;
};

function buildSearchContainer() {
  $('[data-pinned-container] [data-selection]').each((_index, _element) => {
    const [type, selection] = $(_element).attr('data-selection').split(':');
    const filterType = $(_element).attr('data-filter');
    pinned[type].push(selection);
    if (filterType) {
      filterTags[filterType] ||= [];
      filterTags[filterType].push(selection);
    }
    selections[type][selection] = {
      $tag: $(_element),
      children: {},
    };
  });

  categoryDialog.$dom.find('.subcategory__all .search-tag__item').each((_index, _element) => {
    const [, subcategory] = $(_element).attr('data-selection').split(':');
    selections.category[subcategory] = {
      $tag: $(_element),
      children: {},
      $phantom: [
        ...categoryDialog.$dom.find(`.subcategory__selected .search-tag__item[data-selection="category:${subcategory}"]`).get(),
        ...$(`.subcategory-container__selected .search-tag__item[data-selection="category:${subcategory}"]`).get(),
      ],
    };
  });

  $(document).on('click', '[data-category-container] [data-category]', (ev) => {
    $('[data-category-container] [data-category]').removeClass('selected');
    $(ev.currentTarget).addClass('selected');
    $('[data-subcategory-container]').addClass('hide');
    $(`[data-subcategory-container="${$(ev.currentTarget).attr('data-category')}"]`).removeClass('hide');
  });

  $(document).on('click', '.search-tag__item', (ev) => handleTagSelected(ev));
}

async function handleDownload(ev) {
  let name = 'Export';
  // eslint-disable-next-line no-alert
  if (ev.shiftKey) name = prompt(i18n('Filename'), name);
  const pids = ensureAndGetSelectedPids();
  if (pids) await downloadProblemSet(pids, name);
}

function processElement(ele) {
  hideTags(ele);
  createHint('Hint::icon::difficulty', $(ele).find('th.col--difficulty'));
}

const page = new NamedPage(['problem_main'], () => {
  const $body = $('body');
  $body.addClass('display-mode');
  $('.section.display-mode').removeClass('display-mode');

  buildSearchContainer();
  buildLegacyCategoryFilter();
  parseCategorySelection();
  updateSelection();
  $(document).on('click', '[name="leave-edit-mode"]', () => {
    $body.removeClass('edit-mode').addClass('display-mode');
  });
  $(document).on('click', '[name="enter-edit-mode"]', () => {
    $body.removeClass('display-mode').addClass('edit-mode');
  });
  for (const op of ['delete', 'hide', 'unhide', 'copy']) {
    $(document).on('click', `[name="${op}_selected_problems"]`, () => handleOperation(op));
  }
  $(document).on('click', '[name="download_selected_problems"]', handleDownload);

  $(document).on('click', '.toggle-tag', () => {
    $('.section__table-container').children().toggleClass('hide-problem-tag');
  });
  function inputChanged() {
    parseCategorySelection();
    updateSelection();
    loadQuery();
  }
  $('#search').on('click', (ev) => {
    ev.preventDefault();
    inputChanged();
  });
  $('#searchForm').on('submit', inputChanged);
  $('#searchForm').find('input').on('input', _.debounce(inputChanged, 500));
  $('.dialog-button').on('click', (ev) => {
    categoryDialog.clear().open();
    ev.preventDefault();
  });
  $(document).on('click', 'a.pager__item', (ev) => {
    ev.preventDefault();
    pjax.request(ev.currentTarget.getAttribute('href')).then(() => window.scrollTo(0, 0));
  });
  $(document).on('vjContentNew', (e) => processElement(e.target));
  processElement(document);

  addSpeculationRules({
    prerender: [{
      'where': {
        'or': [
          { 'href_matches': '/p/*' },
          { 'href_matches': '/d/*/p/*' },
        ],
      },
    }],
  });
});

export default page;
