import _ from 'lodash';

import { NamedPage } from 'vj/misc/PageLoader';
import Dropdown from 'vj/components/dropdown/Dropdown';
import pjax from 'vj/utils/pjax';
import substitute from 'vj/utils/substitute';

const categories = {};
const dirtyCategories = [];
const selections = [];

function setDomSelected($dom, selected) {
  if (selected) {
    $dom.addClass('selected');
  } else {
    $dom.removeClass('selected');
  }
}

async function updateSelection(sendRequest = true) {
  dirtyCategories.forEach(({ type, category, subcategory }) => {
    let item = categories[category];
    const isSelected = item.select || _.some(item.children, c => c.select);
    setDomSelected(item.$tag, isSelected);
    if (isSelected) {
      selections.push(category);
    } else {
      _.pull(selections, category);
    }
    if (type === 'subcategory') {
      item = categories[category].children[subcategory];
      setDomSelected(item.$tag, item.select);
      const selectionName = `${category},${subcategory}`;
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
      .filter(s => s.indexOf(',') !== -1)
      .map(s => s.split(',')[0]));
    // drop the category if its subcategory is selected
    const requestTags = _.uniq(_.pullAll(selections, requestCategoryTags));
    let url;
    if (requestTags.length === 0) {
      url = Context.getProblemUrlWithoutCategory;
    } else {
      url = substitute(decodeURIComponent(Context.getProblemUrlWithCategory), {
        category: requestTags
          .map(tag => tag.split(',').map(encodeURIComponent).join(','))
          .join('+'), // build a beautiful URL
      });
    }
    pjax.request({ url });
  }
}

function buildCategoryFilter() {
  const $container = $('[data-widget-cf-container]');
  if (!$container) {
    return;
  }
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
  $(document).on('click', '.widget--category-filter__category-tag', (ev) => {
    if (ev.shiftKey || ev.metaKey || ev.ctrlKey) {
      return;
    }
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
    if (ev.shiftKey || ev.metaKey || ev.ctrlKey) {
      return;
    }
    const subcategory = $(ev.currentTarget).text();
    const category = $(ev.currentTarget).attr('data-category');
    const treeItem = categories[category].children[subcategory];
    treeItem.select = !treeItem.select;
    dirtyCategories.push({ type: 'subcategory', subcategory, category });
    updateSelection();
    ev.preventDefault();
  });
}

function parseCategorySelection() {
  Context.currentCategory.split(' ').forEach((cline) => {
    const [category, subcategory] = cline.split(',');
    if (!categories[category]) {
      return;
    }
    if (subcategory && !categories[category].children[subcategory]) {
      return;
    }
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

const page = new NamedPage(['problem_main', 'problem_category'], () => {
  buildCategoryFilter();
  parseCategorySelection();
});

export default page;
