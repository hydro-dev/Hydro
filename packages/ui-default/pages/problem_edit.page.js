import $ from 'jquery';
import _ from 'lodash';
import { ConfirmDialog } from 'vj/components/dialog';
import Dropdown from 'vj/components/dropdown/Dropdown';
import Editor from 'vj/components/editor/index';
import Notification from 'vj/components/notification';
import uploadFiles from 'vj/components/upload';
import download from 'vj/components/zipDownloader';
import { NamedPage } from 'vj/misc/Page';
import {
  i18n, pjax, request, slideDown, slideUp, tpl,
} from 'vj/utils';

const categories = {};
const dirtyCategories = [];
const selections = [];
const tags = [];

function setDomSelected($dom, selected) {
  if (selected) $dom.addClass('selected');
  else $dom.removeClass('selected');
}

async function updateSelection() {
  for (const { type, category, subcategory } of dirtyCategories) {
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
  }
  const requestCategoryTags = _.uniq(selections
    .filter((s) => s.includes(','))
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
  for (const name of $txt.val().split(',').map((i) => i.trim())) {
    if (!name) return;
    const [category, subcategory] = findCategory(name);
    if (!category) tags.push(name);
    else if (!subcategory) {
      categories[category].select = true;
      dirtyCategories.push({ type: 'category', category });
    } else {
      categories[category].children[subcategory].select = true;
      dirtyCategories.push({ type: 'subcategory', subcategory, category });
    }
  }
  updateSelection();
}

function buildCategoryFilter() {
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
        .attr('class', 'widget--category-filter__tag')
        .attr('data-category', categoryText);
      for (const subCategoryTag of $subCategoryTags.get()) {
        const $tag = $(subCategoryTag);
        treeItem.children[$tag.text()] = { select: false, $tag };
      }
      Dropdown.getOrConstruct($categoryTag, {
        target: $drop[0],
        position: 'left center',
      });
    }
  }
  $(document).on('click', '.widget--category-filter__tag', (ev) => {
    if (ev.shiftKey || ev.metaKey || ev.ctrlKey) return;
    const tag = $(ev.currentTarget).text();
    const category = $(ev.currentTarget).attr('data-category');
    const treeItem = category ? categories[category].children[tag] : categories[tag];
    // the effect should be cancelSelect if it is shown as selected when clicking
    const shouldSelect = treeItem.$tag.hasClass('selected') ? false : !treeItem.select;
    treeItem.select = shouldSelect;
    dirtyCategories.push(category
      ? { type: 'subcategory', subcategory: tag, category }
      : { type: 'category', category: tag });
    if (!category && !shouldSelect) {
      // de-select children
      _.forEach(treeItem.children, (treeSubItem, subcategory) => {
        if (treeSubItem.select) {
          treeSubItem.select = false;
          dirtyCategories.push({ type: 'subcategory', subcategory, category: tag });
        }
      });
    }
    updateSelection();
    ev.preventDefault();
  });
}

async function handleSection(ev, sidebar, type) {
  const $section = $(ev.currentTarget).closest(`.section--problem-sidebar-${sidebar}`);
  if ($section.is(`.${type}d, .animating`)) return;
  $section.addClass('animating');
  const $detail = $section.find(`.section--problem-sidebar-${sidebar}__detail`);
  if (type === 'expand') {
    await slideDown($detail, 300, { opacity: 0 }, { opacity: 1 });
  } else {
    await slideUp($detail, 300, { opacity: 1 }, { opacity: 0 });
  }
  $section.addClass(type === 'expand' ? 'expanded' : 'collapsed');
  $section.removeClass(type === 'expand' ? 'collapsed' : 'expanded');
  $section.removeClass('animating');
}

export default new NamedPage(['problem_create', 'problem_edit'], () => {
  let confirmed = false;
  $(document).on('click', '[name="operation"]', (ev) => {
    ev.preventDefault();
    if (confirmed) {
      return request.post('.', { operation: 'delete' }).then((res) => {
        window.location.href = res.url;
      }).catch((e) => {
        Notification.error(e.message);
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

  async function handleClickUpload() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.click();
    await new Promise((resolve) => { input.onchange = resolve; });
    await uploadFiles('./files', input.files, {
      type: 'additional_file',
      sidebar: true,
      pjax: true,
    });
  }

  async function handleClickRename(ev) {
    const file = [$(ev.currentTarget).parent().parent().attr('data-filename')];
    // eslint-disable-next-line no-alert
    const newName = prompt(i18n('Enter a new name for the file: '));
    if (!newName) return;
    try {
      await request.post('./files', {
        operation: 'rename_files',
        files: file,
        newNames: [newName],
        type: 'additional_file',
      });
      Notification.success(i18n('File have been renamed.'));
      await pjax.request({ url: './files?d=additional_file&sidebar=true', push: false });
    } catch (error) {
      Notification.error(error.message);
    }
  }

  async function handleClickRemove(ev) {
    const file = [$(ev.currentTarget).parent().parent().attr('data-filename')];
    const action = await new ConfirmDialog({
      $body: tpl.typoMsg(i18n('Confirm to delete the file?')),
    }).open();
    if (action !== 'yes') return;
    try {
      await request.post('./files', {
        operation: 'delete_files',
        files: file,
        type: 'additional_file',
      });
      Notification.success(i18n('File have been deleted.'));
      await pjax.request({ url: './files?d=additional_file&sidebar=true', push: false });
    } catch (error) {
      Notification.error(error.message);
    }
  }

  async function handleClickDownloadAll() {
    const files = $('.additional_file-table tr').map(function () { return $(this).attr('data-filename'); }).get();
    const { links, pdoc } = await request.post('./files', { operation: 'get_links', files, type: 'additional_file' });
    const targets = [];
    for (const filename of Object.keys(links)) targets.push({ filename, url: links[filename] });
    await download(`${pdoc.docId} ${pdoc.title}.zip`, targets);
  }

  const $main = $('textarea[data-editor]');
  const $field = $('textarea[data-markdown-upload]');
  let content = $field.val();
  let isObject = false;
  let activeTab = $('[data-lang]').first().attr('data-lang');
  try {
    content = JSON.parse(content);
    isObject = !(content instanceof Array);
    if (!isObject) content = JSON.stringify(content);
  } catch (e) { }
  if (!isObject) content = { [activeTab]: content };
  function getContent(lang) {
    let c = '';
    if (content[lang]) c = content[lang];
    else {
      const list = Object.keys(content).filter((l) => l.startsWith(lang));
      if (list.length) c = content[list[0]];
    }
    if (typeof c !== 'string') c = JSON.stringify(c);
    return c;
  }
  $main.val(getContent(activeTab));
  function onChange(val) {
    try {
      val = JSON.parse(val);
      if (!(val instanceof Array)) val = JSON.stringify(val);
    } catch { }
    const empty = /^\s*$/.test(val);
    if (empty) delete content[activeTab];
    else content[activeTab] = val;
    if (!Object.keys(content).length) $field.text('');
    else $field.text(JSON.stringify(content));
  }
  const editor = Editor.getOrConstruct($main, { onChange });
  $('[data-lang]').on('click', (ev) => {
    $('[data-lang]').removeClass('tab--active');
    $(ev.currentTarget).addClass('tab--active');
    const lang = $(ev.currentTarget).attr('data-lang');
    activeTab = lang;
    const val = getContent(lang);
    editor.value(val);
  });
  $('[type="submit"]').on('click', (ev) => {
    if (!$('[name="title"]').val().toString().length) {
      Notification.error(i18n('Title is required.'));
      $('body').scrollTop();
      $('html, body').animate(
        { scrollTop: 0 },
        300,
        () => $('[name="title"]').focus(),
      );
      ev.preventDefault();
    }
  });
  $(document).on('click', '[name="additional_file__upload"]', () => handleClickUpload());
  $(document).on('click', '[name="additional_file__rename"]', (ev) => handleClickRename(ev));
  $(document).on('click', '[name="additional_file__delete"]', (ev) => handleClickRemove(ev));
  $(document).on('click', '[name="additional_file__download"]', () => handleClickDownloadAll());
  $(document).on('click', '[name="additional_file__section__expand"]', (ev) => handleSection(ev, 'additional_file', 'expand'));
  $(document).on('click', '[name="additional_file__section__collapse"]', (ev) => handleSection(ev, 'additional_file', 'collapse'));
  $(document).on('click', '[name="tags__section__expand"]', (ev) => handleSection(ev, 'tags', 'expand'));
  $(document).on('click', '[name="tags__section__collapse"]', (ev) => handleSection(ev, 'tags', 'collapse'));
});
