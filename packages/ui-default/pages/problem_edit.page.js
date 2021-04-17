import _ from 'lodash';
import { NamedPage } from 'vj/misc/Page';
import request from 'vj/utils/request';
import tpl from 'vj/utils/tpl';
import i18n from 'vj/utils/i18n';
import { ConfirmDialog } from 'vj/components/dialog';
import Dropdown from 'vj/components/dropdown/Dropdown';

const categories = {};
const dirtyCategories = [];
const selections = [];
const tags = [];

function setDomSelected($dom, selected) {
  if (selected) $dom.addClass('selected');
  else $dom.removeClass('selected');
}

async function updateSelection() {
  dirtyCategories.forEach(({ type, category, subcategory }) => {
    let item = categories[category];
    const isSelected = item.select || _.some(item.children, (c) => c.select);
    setDomSelected(item.$tag, isSelected);
    if (isSelected) selections.push(category);
    else _.pull(selections, category);
    if (type === 'subcategory') {
      item = categories[category].children[subcategory];
      setDomSelected(item.$tag, item.select);
      const selectionName = subcategory;
      if (item.select) selections.push(selectionName);
      else _.pull(selections, selectionName);
    }
  });
  const requestCategoryTags = _.uniq(selections
    .filter((s) => s.indexOf(',') !== -1)
    .map((s) => s.split(',')[0]));
  // drop the category if its subcategory is selected
  const requestTags = _.uniq(_.pullAll(selections, requestCategoryTags));
  dirtyCategories.length = 0;
  const $txt = $('[name="tag"]');
  $txt.val([...requestTags, ...tags].join(', '));
}

function findCategory(name) {
  const keys = Object.keys(categories);
  if (keys.includes(name)) return [name, null];
  for (const category of keys) {
    const subkeys = Object.keys(categories[category].children);
    if (subkeys.includes(name)) return [category, name];
  }
  return [null, null];
}

function parseCategorySelection() {
  const $txt = $('[name="tag"]');
  tags.length = 0;
  $txt.val().split(',').map((name) => name.trim()).forEach((name) => {
    if (!name) return;
    const [category, subcategory] = findCategory(name);
    if (!category) tags.push(name);
    else if (!subcategory) {
      categories[category].select = true;
      dirtyCategories.push({ type: 'category', category });
    } else if (category) {
      categories[category].children[subcategory].select = true;
      dirtyCategories.push({ type: 'subcategory', subcategory, category });
    }
  });
  updateSelection();
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
      .attr('class', 'widget--category-filter__category-tag');
    const categoryText = $categoryTag.text();
    const $drop = $category
      .children('.chip-list')
      .remove()
      .attr('class', 'widget--category-filter__drop');
    const treeItem = {
      select: false,
      $tag: $categoryTag,
      children: {},
    };
    categories[categoryText] = treeItem;
    $category.empty().append($categoryTag);
    if ($drop.length > 0) {
      const $subCategoryTags = $drop
        .children('li')
        .attr('class', 'widget--category-filter__subcategory')
        .find('a')
        .attr('class', 'widget--category-filter__subcategory-tag')
        .attr('data-category', categoryText);
      $subCategoryTags.get().forEach((subCategoryTag) => {
        const $tag = $(subCategoryTag);
        treeItem.children[$tag.text()] = { select: false, $tag };
      });
      Dropdown.getOrConstruct($categoryTag, {
        target: $drop[0],
        position: 'left center',
      });
    }
  });
  $(document).on('click', '.widget--category-filter__category-tag', (ev) => {
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
          treeSubItem.select = false; // eslint-disable-line no-param-reassign
          dirtyCategories.push({ type: 'subcategory', subcategory, category });
        }
      });
    }
    updateSelection();
    ev.preventDefault();
  });
  $(document).on('click', '.widget--category-filter__subcategory-tag', (ev) => {
    if (ev.shiftKey || ev.metaKey || ev.ctrlKey) return;
    const subcategory = $(ev.currentTarget).text();
    const category = $(ev.currentTarget).attr('data-category');
    const treeItem = categories[category].children[subcategory];
    treeItem.select = !treeItem.select;
    dirtyCategories.push({ type: 'subcategory', subcategory, category });
    updateSelection();
    ev.preventDefault();
  });
}

export default new NamedPage(['problem_create', 'problem_edit'], () => {
  $(document).on('click', '[name="problem-sidebar__show-category"]', (ev) => {
    $(ev.currentTarget).hide();
    $('[name="problem-sidebar__categories"]').show();
  });
  let confirmed = false;
  $(document).on('click', '[name="operation"]', (ev) => {
    ev.preventDefault();
    if (confirmed) {
      return request.post('.', { operation: 'delete' }).then((res) => {
        window.location.href = res.url;
      });
    }
    const message = 'Confirm deleting this problem? Its files, submissions, discussions and solutions will be deleted as well.';
    return new ConfirmDialog({
      $body: tpl`
        <div class="typo">
          <p>${i18n(message)}</p>
        </div>`,
    }).open().then((action) => {
      if (action !== 'yes') return;
      confirmed = true;
      ev.target.click();
    });
  });
  $(document).on('change', '[name="tag"]', parseCategorySelection);
  buildCategoryFilter();
  parseCategorySelection();
});
