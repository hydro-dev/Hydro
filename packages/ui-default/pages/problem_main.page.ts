import $ from 'jquery';
import _ from 'lodash';
import parser from 'search-query-parser';
import DomainSelectAutoComplete from 'vj/components/autocomplete/DomainSelectAutoComplete';
import { ActionDialog, ConfirmDialog, Dialog } from 'vj/components/dialog';
import Dropdown from 'vj/components/dropdown/Dropdown';
import createHint from 'vj/components/hint';
import Notification from 'vj/components/notification';
import { downloadProblemSet } from 'vj/components/zipDownloader';
import { NamedPage } from 'vj/misc/Page';
import {
  delay, i18n, pjax, request, tpl,
} from 'vj/utils';

const categories = {};
let selections: string[] = [];
const list = [];

function setDomSelected($dom, selected) {
  if (selected) $dom.addClass('selected');
  else $dom.removeClass('selected');
}

const parserOptions = {
  keywords: ['category', 'difficulty'],
  offsets: true,
  alwaysArray: true,
  tokenize: true,
};

function writeSelectionToInput() {
  const currentValue = $('[name="q"]').val() as string;
  const parsedCurrentValue = parser.parse(currentValue, parserOptions) as parser.SearchParserResult;
  const q = parser.stringify({
    ...parsedCurrentValue,
    category: selections,
    text: parsedCurrentValue.text,
  }, parserOptions);
  $('[name="q"]').val(q);
}

function updateSelection() {
  selections = _.uniq(selections);
  for (const category in categories) {
    const item = categories[category];
    let childSelected = false;
    for (const subcategory in item.children) {
      const shouldSelect = selections.includes(subcategory);
      const isSelected = item.children[subcategory].$tag[0].hasClass('selected');
      childSelected ||= shouldSelect;
      if (isSelected !== shouldSelect) item.children[subcategory].$tag.forEach((t) => setDomSelected(t, shouldSelect));
    }
    const shouldSelect = selections.includes(category) || childSelected;
    const isSelected = item.$tag[0].hasClass('selected');
    if (isSelected !== shouldSelect) item.$tag.forEach((t) => setDomSelected(t, shouldSelect));
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

function buildCategoryFilter() {
  const $container = $('[data-widget-cf-container]');
  if (!$container) return;
  $container.attr('class', 'widget--category-filter row small-up-3 medium-up-2');
  $container.children('li').get().forEach((category) => {
    const $category = $(category)
      .attr('class', 'widget--category-filter__category column');
    const $categoryTag = $category
      .find('.section__title a')
      .remove()
      .attr('class', 'filter-item category-filter__category-tag');
    const categoryText = $categoryTag.text();
    const $drop = $category
      .children('.chip-list')
      .remove()
      .attr('class', 'widget--category-filter__drop');
    const treeItem = {
      $tag: [$categoryTag],
      children: {},
    };
    categories[categoryText] = treeItem;
    $category.empty().append($categoryTag);
    if ($drop.length > 0) {
      $categoryTag.text(`${$categoryTag.text()}`);
      const $subCategoryTags = $drop
        .children('li')
        .attr('class', 'widget--category-filter__subcategory')
        .find('a')
        .attr('class', 'filter-item category-filter__subcategory-tag')
        .attr('data-category', categoryText);
      $subCategoryTags.get().forEach((subCategoryTag) => {
        const $tag = [$(subCategoryTag)];
        treeItem.children[$tag[0].text()] = {
          $tag,
        };
      });
      Dropdown.getOrConstruct($categoryTag, {
        target: $drop[0],
        position: 'left center',
      });
    }
  });
  list.push(...Object.keys(categories));
  list.push(..._.flatMap(Object.values(categories), (c: any) => Object.keys(c.children)));
}

const tagDialog: any = new Dialog({
  $body: $('.dialog--category-filter > div'),
  cancelByClickingBack: true,
  cancelByEsc: true,
});

function clearSelectedProblemTagCategory() {
  const $problemTagCategoryContainer = tagDialog.$dom.find('[data-category-tab-container]');
  if (!$problemTagCategoryContainer) return;
  $problemTagCategoryContainer.children().removeClass('selected');

  const $problemTagContainer = tagDialog.$dom.find('[data-category-container]');
  if (!$problemTagContainer) return;
  $problemTagContainer.addClass('hide');
}

function selectProblemTagCategory(ele) {
  clearSelectedProblemTagCategory();
  const value = $(ele).attr('data-category-tab');
  if (!value) return;
  $(ele).addClass('selected');
  const $problemTagContainer = tagDialog.$dom.find(`[data-category-container="${value}"]`);
  if (!$problemTagContainer) return;
  $problemTagContainer.removeClass('hide');
}

tagDialog.clear = function () {
  selectProblemTagCategory(this.$dom.find('[data-category-tab-container]').children().first());
  return this;
};

function buildCategoryDialog() {
  const $problemTagCategoryContainer = tagDialog.$dom.find('[data-category-tab-container]');
  if (!$problemTagCategoryContainer) return;
  $problemTagCategoryContainer.on('click', '[data-category-tab]', (ev) => {
    selectProblemTagCategory(ev.currentTarget);
  });

  $problemTagCategoryContainer.children().get().forEach((category) => {
    const categoryText = $(category).attr('data-category-tab');
    categories[categoryText].$tag.push($(category));
    const $problemTagContainer = tagDialog.$dom.find(`[data-category-container="${categoryText}"]`);
    if (!$problemTagContainer) return;
    $problemTagContainer.find('.category-filter__subcategory-tag').get().forEach((subcategory) => {
      const $tag = $(subcategory);
      categories[categoryText].children[$tag.text()].$tag.push($tag);
    });
  });
}

function parsePinnedFilter() {
  $('[data-filter]').get().forEach((ele) => {
    const [type, value] = $(ele).attr('data-filter').split(':');
    if (type === 'difficulty') {
      $(ele).attr('data-difficulty', value).addClass('difficulty-filter__tag');
    }
    if (type === 'category') {
      if (categories[value]) {
        $(ele).addClass('category-filter__category-tag');
      } else {
        const category = Object.keys(categories).find((c) => categories[c].children[value]);
        if (category) {
          $(ele).addClass('category-filter__subcategory-tag').attr('data-category', category);
        }
      }
    }
  });
}

function parseCategorySelection() {
  const parsed = parser.parse($('[name="q"]').val() as string || '', parserOptions) as parser.SearchParserResult;
  selections = _.uniq(parsed.category || []);
  if (parsed.difficulty) parsed.difficulty.forEach((d) => $(`.difficulty-filter__tag[data-difficulty="${d}"]`).addClass('selected'));
  updateSelection();
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
  $(target).find('.problem__tag').get()
    .filter((i) => list.includes(i.children[0].innerHTML))
    .forEach((i) => $(i).addClass('notag--hide'));
}

async function handleDownload(ev) {
  let name = 'Export';
  // eslint-disable-next-line no-alert
  if (ev.shiftKey) name = prompt('Filename:', name);
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
  buildCategoryFilter();
  buildCategoryDialog();
  parsePinnedFilter();
  parseCategorySelection();
  updateSelection();
  $(document).on('click', '.category-filter__category-tag', (ev) => {
    if (ev.shiftKey || ev.metaKey || ev.ctrlKey) return;
    const category = $(ev.currentTarget).text();
    const treeItem = categories[category];
    const shouldSelect = !treeItem.$tag[0].hasClass('selected');
    if (shouldSelect) selections.push(category);
    else selections = _.without(selections, category, ...Object.keys(treeItem.children));
    updateSelection();
    writeSelectionToInput();
    loadQuery();
    ev.preventDefault();
  });
  $(document).on('click', '.category-filter__subcategory-tag', (ev) => {
    if (ev.shiftKey || ev.metaKey || ev.ctrlKey) return;
    const subcategory = $(ev.currentTarget).text();
    const category = $(ev.currentTarget).attr('data-category');
    const treeItem = categories[category].children[subcategory];
    const shouldSelect = !treeItem.$tag[0].hasClass('selected');
    if (shouldSelect) selections.push(subcategory);
    else selections = _.without(selections, subcategory);
    // TODO auto de-select parent
    updateSelection();
    writeSelectionToInput();
    loadQuery();
    ev.preventDefault();
  });
  $(document).on('click', '.difficulty-filter__tag', (ev) => {
    ev.preventDefault();
    if (ev.shiftKey || ev.metaKey || ev.ctrlKey) return;
    const difficulty = $(ev.currentTarget).attr('data-difficulty');
    const shouldSelect = !$(ev.currentTarget).hasClass('selected');
    $(ev.currentTarget).toggleClass('selected');
    const parsed = parser.parse($('[name="q"]').val() as string || '', parserOptions) as parser.SearchParserResult;
    const q = parser.stringify({
      ...parsed,
      difficulty: shouldSelect ? [...(parsed.difficulty || []), difficulty] : parsed.difficulty.filter((d) => d !== difficulty),
    }, parserOptions);
    $('[name="q"]').val(q);
    loadQuery();
  });
  $(document).on('click', '[name="leave-edit-mode"]', () => {
    $body.removeClass('edit-mode').addClass('display-mode');
  });
  $(document).on('click', '[name="enter-edit-mode"]', () => {
    $body.removeClass('display-mode').addClass('edit-mode');
  });
  ['delete', 'hide', 'unhide', 'copy'].forEach((op) => {
    $(document).on('click', `[name="${op}_selected_problems"]`, () => handleOperation(op));
  });
  $(document).on('click', '[name="download_selected_problems"]', handleDownload);

  $(document).on('click', '.toggle-tag', () => {
    $('.section__table-container').toggleClass('hide-problem-tag');
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
  $(document).on('click', 'a.pager__item', (ev) => {
    ev.preventDefault();
    pjax.request(ev.currentTarget.getAttribute('href')).then(() => window.scrollTo(0, 0));
  });
  $(document).on('vjContentNew', (e) => processElement(e.target));
  processElement(document);
  $('[data-categories-dialog-button]').on('click', (ev) => {
    ev.preventDefault();
    tagDialog.clear().open();
  });
});

export default page;
