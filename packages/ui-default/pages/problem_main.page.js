import { WritableStream } from 'web-streams-polyfill/dist/ponyfill.es6';
import _ from 'lodash';
import { dump } from 'js-yaml';
import * as streamsaver from 'streamsaver';
import { NamedPage } from 'vj/misc/Page';
import Notification from 'vj/components/notification';
import { ConfirmDialog } from 'vj/components/dialog';
import Dropdown from 'vj/components/dropdown/Dropdown';
import { createZipStream } from 'vj/utils/zip';
import pjax from 'vj/utils/pjax';
import substitute from 'vj/utils/substitute';
import request from 'vj/utils/request';
import tpl from 'vj/utils/tpl';
import pipeStream from 'vj/utils/pipeStream';
import delay from 'vj/utils/delay';
import i18n from 'vj/utils/i18n';

const categories = {};
const dirtyCategories = [];
const selections = [];
// Firefox have no WritableStream
if (!window.WritableStream) streamsaver.WritableStream = WritableStream;
if (window.location.protocol === 'https:'
  || window.location.protocol === 'chrome-extension:'
  || window.location.hostname === 'localhost') {
  streamsaver.mitm = '/streamsaver/mitm.html';
}

let isBeforeUnloadTriggeredByLibrary = !window.isSecureContext;
function onBeforeUnload(e) {
  if (isBeforeUnloadTriggeredByLibrary) {
    isBeforeUnloadTriggeredByLibrary = false;
    return;
  }
  e.returnValue = '';
}

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
    const isSelected = item.select || _.some(item.children, (c) => c.select);
    setDomSelected(item.$tag, isSelected);
    if (isSelected) {
      selections.push(category);
    } else {
      _.pull(selections, category);
    }
    if (type === 'subcategory') {
      item = categories[category].children[subcategory];
      setDomSelected(item.$tag, item.select);
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
    let url;
    if (requestTags.length === 0) {
      url = UiContext.getProblemUrlWithoutCategory;
    } else {
      url = substitute(decodeURIComponent(UiContext.getProblemUrlWithCategory), {
        category: requestTags
          .map((tag) => tag.split(',').map(encodeURIComponent).join(','))
          .join('+'), // build a beautiful URL
      });
    }
    const q = $('[name="q"]').val();
    if (q) url += `?q=${q}`;
    pjax.request({ url });
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
  UiContext.currentCategory.split(' ').forEach((cline) => {
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
  if (operation === 'delete') {
    const action = await new ConfirmDialog({
      $body: tpl`
        <div class="typo">
          <p>${i18n('Confirm to delete the selected problems?')}</p>
        </div>`,
    }).open();
    if (action !== 'yes') return;
  }
  try {
    await request.post('', { operation, pids });
    Notification.success(i18n(`Selected problems have been ${operation}d.`));
    await delay(2000);
    window.location.reload();
  } catch (error) {
    Notification.error(error.message);
  }
}

async function handleDownload() {
  const pids = ensureAndGetSelectedPids();
  const fileStream = streamsaver.createWriteStream('Export.zip');
  const targets = [];
  for (const pid of pids) {
    const { pdoc } = await request.get(`p/${pid}`);
    targets.push({ filename: `${pid}/problem.yaml`, content: dump(pdoc) });
    let { links } = await request.post(`p/${pid}/files`, { operation: 'get_links', files: pdoc.data.map((i) => i.name), type: 'testdata' });
    for (const filename of Object.keys(links)) {
      targets.push({ filename: `${pid}/testdata/${filename}`, url: links[filename] });
    }
    ({ links } = await request.post(`p/${pid}/files`, {
      operation: 'get_links', files: pdoc.additional_file.map((i) => i.name), type: 'additional_file',
    }));
    for (const filename of Object.keys(links)) {
      targets.push({ filename: `${pid}/additional_file/${filename}`, url: links[filename] });
    }
  }
  let i = 0;
  const zipStream = createZipStream({
    // eslint-disable-next-line consistent-return
    async pull(ctrl) {
      if (i === targets.length) return ctrl.close();
      try {
        if (targets[i].url) {
          const response = await fetch(targets[i].url);
          if (!response.ok) throw response.statusText;
          ctrl.enqueue({
            name: targets[i].filename,
            stream: () => response.body,
          });
        } else {
          ctrl.enqueue({
            name: targets[i].filename,
            stream: () => new Blob([targets[i].content], { type: 'application/json' }).stream(),
          });
        }
      } catch (e) {
        // eslint-disable-next-line no-use-before-define
        stopDownload();
        Notification.error(i18n('problem_files.download_as_archive_error', [targets[i].filename, e.toString()]));
      }
      i++;
    },
  });
  const abortCallbackReceiver = {};
  function stopDownload() { abortCallbackReceiver.abort(); }
  window.addEventListener('unload', stopDownload);
  window.addEventListener('beforeunload', onBeforeUnload);
  await pipeStream(zipStream, fileStream, abortCallbackReceiver);
  window.removeEventListener('unload', stopDownload);
  window.removeEventListener('beforeunload', onBeforeUnload);
}

const page = new NamedPage(['problem_main', 'problem_category'], () => {
  const doc = document.documentElement;
  doc.className += ' display-mode';
  buildCategoryFilter();
  parseCategorySelection();
  $('[name="leave-edit-mode"]').on('click', () => {
    doc.className = doc.className.replace(' edit-mode', ' display-mode');
  });
  $('[name="enter-edit-mode"]').on('click', () => {
    doc.className = doc.className.replace(' display-mode', ' edit-mode');
  });
  $('[name="remove_selected_problems"]').on('click', () => handleOperation('delete'));
  $('[name="hide_selected_problems"]').on('click', () => handleOperation('hide'));
  $('[name="unhide_selected_problems"]').on('click', () => handleOperation('unhide'));
  $('[name="download_selected_problems"]').on('click', handleDownload);
  $('#search').on('click', (ev) => {
    ev.preventDefault();
    updateSelection();
  });
});

export default page;
