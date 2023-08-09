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

const categories = {};
const dirtyCategories = [];
const selections = [];
const list = [];

function setDomSelected($dom, selected) {
  if (selected) $dom.addClass('selected');
  else $dom.removeClass('selected');
}

async function updateSelection(sendRequest = true) {
  dirtyCategories.forEach(({ type, category, subcategory }) => {
    let item = categories[category];
    const isSelected = item.select || _.some(item.children, (c) => c.select);
    item.$tag.forEach((i) => setDomSelected(i, isSelected));
    if (isSelected) {
      selections.push(category);
    } else {
      _.pull(selections, category);
    }
    if (type === 'subcategory') {
      item = categories[category].children[subcategory];
      item.$tag.forEach((i) => setDomSelected(i, item.select));
      const selectionName = subcategory;
      if (item.select) {
        selections.push(selectionName);
      } else {
        _.pull(selections, selectionName);
      }
    }
  });
  dirtyCategories.length = 0;
  if (sendRequest) {
    // a list of categories which subcategory is selected
    const requestCategoryTags = _.uniq(selections
      .filter((s) => s.indexOf(',') !== -1)
      .map((s) => s.split(',')[0]));
    // drop the category if its subcategory is selected
    const requestTags = _.uniq(_.pullAll(selections, requestCategoryTags));
    let q = $('[name="q"]').val().split(' ').filter((i) => !i.startsWith('category:')).join(' ');
    if (requestTags.length) q = requestTags.map((i) => `category:${i}`).join(' ') + (q ? ` ${q}` : '');
    const url = new URL(window.location.href);
    if (!q) url.searchParams.delete('q');
    else url.searchParams.set('q', q);
    url.searchParams.delete('page');
    pjax.request({ url: url.toString() });
    $('[name="q"]').val(q);
  }
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
      .attr('class', 'category-filter__category-tag');
    const categoryText = $categoryTag.text();
    const $drop = $category
      .children('.chip-list')
      .remove()
      .attr('class', 'widget--category-filter__drop');
    const treeItem = {
      select: false,
      $tag: [$categoryTag],
      children: {},
    };
    categories[categoryText] = treeItem;
    $category.empty().append($categoryTag);
    if ($drop.length > 0) {
      $categoryTag.text(`${$categoryTag.text()}`);
      const $subCategoryTags = $drop
        .children('li')
        .attr('class', 'category-filter__subcategory')
        .find('a')
        .attr('class', 'category-filter__subcategory-tag')
        .attr('data-category', categoryText);
      $subCategoryTags.get().forEach((subCategoryTag) => {
        const $tag = [$(subCategoryTag)];
        treeItem.children[$(subCategoryTag).text()] = {
          select: false,
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
  list.push(..._.flatMap(Object.values(categories), (c) => Object.keys(c.children)));
}

const tagDialog = new Dialog({
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

function buildDisplayCategory() {
  const $displayCategoryContainer = $('[data-display-category-container]');
  if (!$displayCategoryContainer.length) return;
  $displayCategoryContainer.get().forEach((container) => {
    $(container).find('.category-filter__subcategory-tag').get().forEach((subcategory) => {
      const $tag = $(subcategory);
      const categoryText = $tag.attr('data-category');
      const subcategoryText = $tag.attr('data-subcategory');
      categories[categoryText].children[subcategoryText].$tag.push($tag);
    });
  });
}

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
      categories[categoryText].children[$tag.attr('data-subcategory')].$tag.push($tag);
    });
  });
}

function parseCategorySelection() {
  UiContext.currentCategory.split(' ').forEach((cline) => {
    const [category, subcategory] = cline.split(',');
    if (!categories[category]) return;
    if (subcategory && !categories[category].children[subcategory]) return;
    if (!subcategory) {
      categories[category].select = true;
      dirtyCategories.push({ type: 'category', category });
    } else {
      categories[category].children[subcategory].select = true;
      dirtyCategories.push({ type: 'subcategory', subcategory, category });
    }
  });
  updateSelection(false);
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
  const payload = {};
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
    const domainSelector = DomainSelectAutoComplete.getOrConstruct($('.dialog__body--problem-copy [name="target"]'));
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
    updateSelection(true);
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
  buildDisplayCategory();
  buildCategoryDialog();
  parseCategorySelection();
  $(document).on('click', '.category-filter__category-tag', (ev) => {
    if (ev.shiftKey || ev.metaKey || ev.ctrlKey) return;
    const category = $(ev.currentTarget).text();
    const treeItem = categories[category];
    // the effect should be cancelSelect if it is shown as selected when clicking
    const shouldSelect = treeItem.$tag.hasClass('selected') ? false : !treeItem.select;
    treeItem.select = shouldSelect;
    dirtyCategories.push({ type: 'category', category });
    if (!shouldSelect) {
      // de-select children
      _.forEach(treeItem.children, (treeSubItem, subcategory) => {
        if (treeSubItem.select) {
          treeSubItem.select = false;
          dirtyCategories.push({ type: 'subcategory', subcategory, category });
        }
      });
    }
    updateSelection();
    ev.preventDefault();
  });
  $(document).on('click', '.category-filter__subcategory-tag', (ev) => {
    if (ev.shiftKey || ev.metaKey || ev.ctrlKey) return;
    const subcategory = $(ev.currentTarget).text();
    const category = $(ev.currentTarget).attr('data-category');
    const treeItem = categories[category].children[subcategory];
    treeItem.select = !treeItem.select;
    dirtyCategories.push({ type: 'subcategory', subcategory, category });
    updateSelection();
    ev.preventDefault();
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
    $('.section__table-container').children(1).toggleClass('hide-problem-tag');
  });

  // TODO: update this to according to the new descriptors.
  $('#search').on('click', (ev) => {
    ev.preventDefault();
    updateSelection();
  });
  $('#searchForm').on('submit', updateSelection);
  $('#searchForm').find('input').on('input', _.debounce(updateSelection, 500));
  $(document).on('click', 'a.pager__item', (ev) => {
    ev.preventDefault();
    pjax.request(ev.currentTarget.getAttribute('href')).then(() => window.scrollTo(0, 0));
  });
  $(document).on('vjContentNew', (e) => processElement(e.target));
  processElement(document);
  $('[data-problem-tag-dialog-button]').on('click', (ev) => {
    ev.preventDefault();
    tagDialog.clear().open();
  });
});

export default page;
