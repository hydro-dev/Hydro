import $ from 'jquery';
import _ from 'lodash';
import ReactDOM from 'react-dom/client';
import { confirm } from 'vj/components/dialog';
import Dropdown from 'vj/components/dropdown/Dropdown';
import Notification from 'vj/components/notification';
import { resolveStatementEditor, statementKinds as kinds } from 'vj/components/statement/editors';
import uploadFiles from 'vj/components/upload';
import { NamedPage } from 'vj/misc/Page';
import { i18n, request, tpl } from 'vj/utils';

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
    return confirm(i18n('Confirm deleting this problem? Its files, submissions, discussions and solutions will be deleted as well.')).then((yes) => {
      if (!yes) return;
      confirmed = true;
      ev.target.click();
    });
  });
  $(document).on('change', '[name="tag"]', parseCategorySelection);
  buildCategoryFilter();
  parseCategorySelection();

  // ---------- statements ----------
  const langs = UiContext.statementLangs || {};
  const isCreate = !!UiContext.problemCreate;
  const $field = $('textarea[name="content"]');
  const defaultLang = UserContext.viewLang || i18n('__id');

  // Parse a submitted-shape JSON string into entries (null when not statement JSON).
  // Used both for the server-rendered initial value and for restoring the draft
  // the browser puts back into the textarea when returning from an error page.
  function parseDraft(val) {
    try {
      const parsed = JSON.parse(val);
      if (!Array.isArray(parsed) || !parsed.every(
        (v) => typeof v === 'object' && v && typeof v.name === 'string' && typeof v.lang === 'string')
      ) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  const entries = parseDraft(($field.val() || '').toString()) ?? parseDraft($field[0].defaultValue) ?? [{
    name: `problem_${defaultLang}.md`,
    lang: defaultLang,
    content: String($field.val() || ''),
  }];

  // file names known to exist: server-provided additional files plus uploads from this session
  const knownFiles = new Set((UiContext.additionalFiles || []).map((f) => f.name));

  let activeName = entries[0]?.name || null;
  let editorHandle = null;
  // assigned after the render functions are defined; kept as a variable to avoid forward references
  let refreshUI = () => { };
  const serialize = () => $field.val(JSON.stringify(entries));
  const activeEntry = () => entries.find((e) => e.name === activeName);
  const hasName = (n) => entries.some((e) => e.name === n);

  function addTextEntry(ext) {
    const lang = activeEntry()?.lang || defaultLang;
    let name = `problem_${lang}.${ext}`;
    let i = 1;
    while (hasName(name)) name = `problem_${lang}_${++i}.${ext}`;
    entries.push({ name, lang, content: '' });
    refreshUI(name);
  }

  // no display:none here: the Drop instance manages the menu's visibility itself
  const $kindMenu = $(tpl`<ol class="menu"></ol>`).appendTo('body');
  for (const kind of kinds) {
    $(tpl`<a class="menu__link" data-kind="${kind.id}" href="javascript:;">${i18n(kind.label)}</a>`)
      .on('click', () => {
        $('a[name="statement-add"]').data('vjDropdownInstance')?.dropInstance?.close();
        if (kind.extension) addTextEntry(kind.extension);
        else if (kind.accept) $('#statement-file-input').attr('accept', kind.accept).trigger('click');
      })
      .appendTo($('<li class="menu__item"></li>').appendTo($kindMenu));
  }

  function deleteEntry(name) {
    const e = entries.find((x) => x.name === name);
    _.pull(entries, e);
    if (activeName === name) activeName = entries[0]?.name || null;
    refreshUI();
  }

  function renderTabs() {
    Dropdown.get($('#statement-tabs a[name="statement-add"]'))?.detach();
    const $tabs = $('#statement-tabs').empty();
    for (const e of entries) {
      $(tpl`
        <a class="section__tab-header-item ${e.name === activeName ? 'tab--active' : ''}" data-name="${e.name}" href="#">
          ${e.name} <sup class="supplementary">${langs[e.lang] || e.lang}</sup>
          <span class="icon icon-close statement-tab-del" title="${i18n('Delete Statement')}"></span>
        </a>`).appendTo($tabs);
    }
    const title = i18n('Add statement');
    const $add = $(tpl`
      <a class="section__tab-header-item" name="statement-add" href="javascript:;" title="${title}">
        <span class="icon icon-add"></span>
      </a>`).appendTo($tabs);
    Dropdown.getOrConstruct($add, { target: $kindMenu[0], position: 'bottom left' });
  }

  function renderProps() {
    const e = activeEntry();
    const $props = $('#statement-props').empty();
    if (!e) return;
    const $name = $(tpl`<input class="textbox inline compact flex-fill" value="${e.name}" placeholder="${i18n('Filename (with extension)')}">`)
      .on('change', async () => {
        const newName = String($name.val() || '').trim();
        if (!newName || newName === e.name) {
          $name.val(e.name);
          return;
        }
        if (hasName(newName)) {
          Notification.error(i18n('Duplicate statement filename.'));
          $name.val(e.name);
          return;
        }
        if (e.file) {
          if (isCreate) {
            // user-file storage has no rename operation; rename on the edit page after creation
            Notification.error(i18n('Please rename it on the edit page after creating the problem.'));
            $name.val(e.name);
            return;
          }
          try {
            await request.post('./files', {
              operation: 'rename_files',
              files: [e.file],
              newNames: [newName],
              type: 'additional_file',
            });
          } catch (err) {
            Notification.error(err.message);
            $name.val(e.name);
            return;
          }
          e.file = newName;
        }
        e.name = newName;
        refreshUI(newName);
      });
    const $lang = $('<select class="inline compact select"></select>');
    // an unknown lang code (e.g. from an imported problem) still gets its own option,
    // otherwise the select would silently display some other language
    const langOptions = Object.keys(langs).includes(e.lang)
      ? Object.entries(langs)
      : [[e.lang, `${e.lang} (${i18n('Unknown language')})`], ...Object.entries(langs)];
    for (const [k, v] of langOptions) {
      $(tpl`<option value="${k}" ${k === e.lang ? 'selected' : ''}>${v}</option>`).appendTo($lang);
    }
    $lang.on('change', () => {
      e.lang = String($lang.val());
      serialize();
      renderTabs();
    });
    $props.append($name).append($lang);
  }

  function renderEditor() {
    editorHandle?.destroy?.();
    const e = activeEntry();
    const $area = $('#statement-editor-area').empty();
    if (!e) {
      $area.append($(tpl`<p class="note">${i18n('No statement yet. Use the + button in the tab bar to add one.')}</p>`));
      return;
    }
    const factory = resolveStatementEditor(e.name);
    editorHandle = factory({ entry: e, $container: $area });
    editorHandle.onChange((value) => {
      if (e.content !== undefined) e.content = value;
      serialize();
    });
  }

  refreshUI = (name) => {
    if (name !== undefined) activeName = name;
    serialize();
    renderTabs();
    renderProps();
    renderEditor();
  };

  $('#statement-file-input').on('change', async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const name = file.name;
    if (hasName(name)) {
      Notification.error(i18n('Duplicate statement filename.'));
      ev.target.value = '';
      return;
    }
    try {
      await uploadFiles(isCreate ? '/file' : './files', [file], isCreate ? {} : { type: 'additional_file' });
    } catch (e) {
      ev.target.value = '';
      return;
    }
    knownFiles.add(name);
    entries.push({ name, lang: activeEntry()?.lang || defaultLang, file: name });
    refreshUI(name);
    ev.target.value = '';
  });

  refreshUI();

  $('#statement-tabs').on('click', '.section__tab-header-item', (ev) => {
    ev.preventDefault();
    const $item = $(ev.currentTarget);
    if ($(ev.target).closest('.statement-tab-del').length) {
      // modifier keys skip the confirmation
      if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) {
        deleteEntry($item.attr('data-name'));
        return;
      }
      confirm(i18n('Confirm deleting this statement?')).then((yes) => {
        if (yes) deleteEntry($item.attr('data-name'));
      });
      return;
    }
    const name = $item.attr('data-name');
    if (!name || name === activeName) return;
    refreshUI(name);
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
      return;
    }
    for (const e of entries) {
      const isEmpty = !e.file && (e.content === undefined || !String(e.content).trim().length);
      if (isEmpty) {
        Notification.error(i18n('Statement {0} is empty.', e.name));
        ev.preventDefault();
        return;
      }
      if (e.file && !knownFiles.has(e.file)) {
        Notification.error(i18n('File {0} referenced by statement {1} does not exist.', e.file, e.name));
        ev.preventDefault();
        return;
      }
    }
    const names = entries.map((e) => e.name);
    if (new Set(names).size !== names.length) {
      Notification.error(i18n('Duplicate statement filename.'));
      ev.preventDefault();
      return;
    }
    for (const e of entries) {
      if (!e.name || !e.name.includes('.')) {
        Notification.error(i18n('Invalid statement filename: {0}', e.name));
        ev.preventDefault();
        return;
      }
    }
    serialize();
  });

  if (localStorage.getItem('polyhedron-hint') === 'dismiss') return;
  $(tpl`<div name="hint" class="typo"></div>`).prependTo('.medium-9.columns .section__body');
  const root = ReactDOM.createRoot(document.querySelector('[name="hint"]'));
  function ignore() {
    root.unmount();
    localStorage.setItem('polyhedron-hint', 'dismiss');
  }
  /* eslint-disable max-len */
  root.render(<blockquote className="note">
    <p>{i18n('For better problem version management and validation, we suggest using Polyhedron to prepare problems.')}</p>
    <p>{i18n('Polyhedron supports managing problem version history, testing solutions, checking time limits, composing contest statements, cooperation and much more.')}</p>
    <p>{i18n('Problems created in polyhedron can be directly imported into any Hydro based online judge system.')}</p>
    <a href="https://polyhedron.hydro.ac/" target="_blank">{i18n('Open Polyhedron')}</a> / <a onClick={() => root.unmount()}>{i18n('Dismiss')}</a> / <a onClick={ignore}>{i18n("Don't show again")}</a>
  </blockquote>);
});
