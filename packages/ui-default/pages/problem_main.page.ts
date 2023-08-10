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
  delay, i18n, pjax, request, tpl,
} from 'vj/utils';

const list = [];
const legacyCategories = {};

const categories = {};
const difficulties = {};
let categorySelections: string[] = [];
let difficultySelections: string[] = [];

const categoryDialog = new Dialog({
  $body: $('.dialog--category-filter'),
  cancelByClickingBack: true,
  cancelByEsc: true,
});

function setDomSelected($dom, selected) {
  if (selected) $dom.addClass('selected');
  else $dom.removeClass('selected');
}

function setIconSelected($dom, selected, icon) {
  if (selected) $dom.append(icon);
  else $dom.find('span').remove();
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
    category: categorySelections,
    difficulty: difficultySelections,
    text: parsedCurrentValue.text,
  }, parserOptions);
  $('[name="q"]').val(q);
}

function updateSelection() {
  categorySelections = _.uniq(categorySelections);
  for (const category in legacyCategories) {
    const item = legacyCategories[category];
    let childSelected = false;
    for (const subcategory in item.children) {
      const shouldSelect = categorySelections.includes(subcategory);
      const isSelected = item.children[subcategory].$tag.hasClass('selected');
      childSelected ||= shouldSelect;
      if (isSelected !== shouldSelect) setDomSelected(item.children[subcategory].$tag, shouldSelect);
    }
    const shouldSelect = categorySelections.includes(category) || childSelected;
    const isSelected = item.$tag.hasClass('selected');
    if (isSelected !== shouldSelect) setDomSelected(item.$tag, shouldSelect);
  }

  const $typeContainer = $('[data-type-container]');
  if (!$typeContainer) return;
  const typeCategories = $typeContainer.children()
    .map((index, element) => $(element).attr('data-selection').split(':')[1])
    .get();
  for (const category in categories) {
    const item = categories[category];
    const shouldSelect = categorySelections.includes(category);
    const isSelected = item.$tag.hasClass('selected');
    if (isSelected !== shouldSelect) {
      setDomSelected(item.$tag, shouldSelect);
      if (typeCategories.includes(category)) {
        setIconSelected(item.$tag, shouldSelect, '<span class="icon icon-check"></span>');
      } else {
        setIconSelected(item.$tag, shouldSelect, '<span class="icon icon-close"></span>');
        for (const $element of item.$phantom) {
          if (shouldSelect) $element.removeClass('hide');
          else $element.addClass('hide');
        }
      }
    }
  }

  for (const difficulty in difficulties) {
    const item = difficulties[difficulty];
    const shouldSelect = difficultySelections.includes(difficulty);
    const isSelected = item.$tag.hasClass('selected');
    if (isSelected !== shouldSelect) {
      setDomSelected(item.$tag, shouldSelect);
      setIconSelected(item.$tag, shouldSelect, '<span class="icon icon-check"></span>');
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

function buildLegacyCategoryFilter() {
  const $container = $('[data-widget-cf-container]');
  if (!$container) return;
  $container.attr('class', 'widget--category-filter row small-up-3 medium-up-2');
  $container.children('li').get().forEach((category) => {
    const $category = $(category)
      .attr('class', 'widget--category-filter__category column');
    const $categoryTag = $category
      .find('.section__title a')
      .remove()
      .attr('class', 'widget--category-filter__category-tag');
    const categoryText = $categoryTag.text();
    const $drop = $category
      .children('.chip-list')
      .remove()
      .attr('class', 'widget--category-filter__drop');
    const treeItem = {
      $tag: $categoryTag,
      children: {},
    };
    legacyCategories[categoryText] = treeItem;
    $category.empty().append($categoryTag);
    if ($drop.length > 0) {
      $categoryTag.text(`${$categoryTag.text()}`);
      const $subCategoryTags = $drop
        .children('li')
        .attr('class', 'widget--category-filter__subcategory')
        .find('a')
        .attr('class', 'widget--category-filter__subcategory-tag')
        .attr('data-category', categoryText);
      $subCategoryTags.get().forEach((subCategoryTag) => {
        const $tag = $(subCategoryTag);
        treeItem.children[$tag.text()] = {
          $tag,
        };
      });
      Dropdown.getOrConstruct($categoryTag, {
        target: $drop[0],
        position: 'left center',
      });
    }
  });
  list.push(...Object.keys(legacyCategories));
  list.push(..._.flatMap(Object.values(legacyCategories), (c: any) => Object.keys(c.children)));
  $(document).on('click', '.widget--category-filter__category-tag', (ev) => {
    if (ev.shiftKey || ev.metaKey || ev.ctrlKey) return;
    const category = $(ev.currentTarget).text();
    const treeItem = legacyCategories[category];
    const shouldSelect = !treeItem.$tag.hasClass('selected');
    if (shouldSelect) categorySelections.push(category);
    else categorySelections = _.without(categorySelections, category, ...Object.keys(treeItem.children));
    updateSelection();
    writeSelectionToInput();
    loadQuery();
    ev.preventDefault();
  });
  $(document).on('click', '.widget--category-filter__subcategory-tag', (ev) => {
    if (ev.shiftKey || ev.metaKey || ev.ctrlKey) return;
    const subcategory = $(ev.currentTarget).text();
    const category = $(ev.currentTarget).attr('data-category');
    const treeItem = legacyCategories[category].children[subcategory];
    const shouldSelect = !treeItem.$tag.hasClass('selected');
    if (shouldSelect) categorySelections.push(subcategory);
    else categorySelections = _.without(categorySelections, subcategory);
    // TODO auto de-select parent
    updateSelection();
    writeSelectionToInput();
    loadQuery();
    ev.preventDefault();
  });
}

function parseCategorySelection() {
  const parsed = parser.parse($('[name="q"]').val() as string || '', parserOptions) as SearchParserResult;
  categorySelections = _.uniq(parsed.category || []);
  difficultySelections = _.uniq(parsed.difficulty || []);
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

function clearCategoryDialog(): Dialog {
  const $dataCategoryContainer = categoryDialog.$dom.find('[data-category-container]');
  if (!$dataCategoryContainer) return;
  $dataCategoryContainer.children().each((_index, _element) => {
    setDomSelected($(_element), false);
    const category = $(_element).attr('data-category');
    const $subCategoryContainer = categoryDialog.$dom.find(`[data-subcategory-container="${category}"]`);
    $subCategoryContainer.addClass('hide');
  });
  const first = $dataCategoryContainer.children().first();
  setDomSelected(first, true);
  const category = first.attr('data-category');
  const $subCategoryContainer = categoryDialog.$dom.find(`[data-subcategory-container="${category}"]`);
  $subCategoryContainer.removeClass('hide');
  return categoryDialog;
}

function buildSearchContainer() {
  const $typeContainer = $('[data-type-container]');
  if (!$typeContainer) return;
  $typeContainer.children().each((index, element) => {
    const selection = $(element).attr('data-selection').split(':')[1];
    categories[selection] = {
      $tag: $(element),
      children: {},
    };

    $(element).on('click', (ev) => {
      if (ev.shiftKey || ev.metaKey || ev.ctrlKey) return;
      const shouldSelect = !categories[selection].$tag.hasClass('selected');
      if (shouldSelect) categorySelections.push(selection);
      else categorySelections = _.without(categorySelections, selection, ...Object.keys(categories[selection].children));
      updateSelection();
      writeSelectionToInput();
      loadQuery();
      ev.preventDefault();
    });
  });

  const $difficultyContainer = $('[data-difficulty-container]');
  if (!$difficultyContainer) return;
  $difficultyContainer.children().each((index, element) => {
    const selection = $(element).attr('data-selection').split(':')[1];
    difficulties[selection] = {
      $tag: $(element),
      children: {},
    };

    $(element).on('click', (ev) => {
      if (ev.shiftKey || ev.metaKey || ev.ctrlKey) return;
      const shouldSelect = !difficulties[selection].$tag.hasClass('selected');
      if (shouldSelect) difficultySelections.push(selection);
      else difficultySelections = _.without(difficultySelections, selection, ...Object.keys(difficulties[selection].children));
      updateSelection();
      writeSelectionToInput();
      loadQuery();
      ev.preventDefault();
    });
  });

  $('.dialog-button.list__item')?.on('click', (ev) => {
    clearCategoryDialog().open();
    ev.preventDefault();
  });

  const $dataCategoryContainer = categoryDialog.$dom.find('[data-category-container]');
  if (!$dataCategoryContainer) return;
  $dataCategoryContainer.children().each((index, element) => {
    const category = $(element).attr('data-category');
    const $subCategoryContainer = categoryDialog.$dom.find(`[data-subcategory-container="${category}"]`);
    $(element).on('click', () => {
      $dataCategoryContainer.children().each((_index, _element) => {
        setDomSelected($(_element), false);
        const _category = $(_element).attr('data-category');
        categoryDialog.$dom.find(`[data-subcategory-container="${_category}"]`)?.addClass('hide');
      });
      setDomSelected($(element), true);
      $subCategoryContainer.removeClass('hide');
    });
    $subCategoryContainer.find('.subcategory__all .list__item').each((_index, _element) => {
      const subcategory = $(_element).attr('data-selection');
      categories[subcategory] = {
        $tag: $(_element),
        children: {},
        $phantom: [],
      };
      $(_element).on('click', (ev) => {
        if (ev.shiftKey || ev.metaKey || ev.ctrlKey) return;
        const shouldSelect = !categories[subcategory].$tag.hasClass('selected');
        if (shouldSelect) categorySelections.push(subcategory);
        else categorySelections = _.without(categorySelections, subcategory, ...Object.keys(categories[subcategory].children));
        updateSelection();
        writeSelectionToInput();
        loadQuery();
        ev.preventDefault();
      });
    });
    $subCategoryContainer.find('.subcategory__selected .list__item').each((_index, _element) => {
      const subcategory = $(_element).attr('data-selection');
      categories[subcategory].$phantom.push($(_element));
      $(_element).on('click', (ev) => {
        if (ev.shiftKey || ev.metaKey || ev.ctrlKey) return;
        categorySelections = _.without(categorySelections, subcategory, ...Object.keys(categories[subcategory].children));
        updateSelection();
        writeSelectionToInput();
        loadQuery();
        ev.preventDefault();
      });
    });
  });

  $('section > .subcategory-container > .subcategory-container__selected .list__item')?.each((index, element) => {
    const subcategory = $(element).attr('data-selection');
    categories[subcategory].$phantom.push($(element));
    $(element).on('click', (ev) => {
      if (ev.shiftKey || ev.metaKey || ev.ctrlKey) return;
      categorySelections = _.without(categorySelections, subcategory, ...Object.keys(categories[subcategory].children));
      updateSelection();
      writeSelectionToInput();
      loadQuery();
      ev.preventDefault();
    });
  });
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

function inputChanged() {
  parseCategorySelection();
  updateSelection();
  loadQuery();
}

const page = new NamedPage(['problem_main'], () => {
  const $body = $('body');
  $body.addClass('display-mode');
  $('.section.display-mode').removeClass('display-mode');
  buildLegacyCategoryFilter();

  buildSearchContainer();
  parseCategorySelection();
  updateSelection();
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
});

export default page;
