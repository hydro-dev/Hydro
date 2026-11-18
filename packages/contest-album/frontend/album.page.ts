import { addPage, ConfirmDialog, i18n, NamedPage, tpl } from '@hydrooj/ui-default';

function viewer() {
  const dialog = document.querySelector<HTMLDialogElement>('[data-album-viewer]');
  const buttons = [...document.querySelectorAll<HTMLAnchorElement>('[data-album-photo]')];
  if (!dialog || !buttons.length) return;
  const image = dialog.querySelector<HTMLImageElement>('[data-viewer-image]');
  const caption = dialog.querySelector<HTMLElement>('[data-viewer-caption]');
  const counter = dialog.querySelector<HTMLElement>('[data-viewer-count]');
  const original = dialog.querySelector<HTMLAnchorElement>('[data-viewer-original]');
  let current = 0;
  let touchX: number | undefined;
  const show = (index: number) => {
    current = (index + buttons.length) % buttons.length;
    const photo = buttons[current];
    image.src = photo.dataset.albumPreview;
    image.alt = photo.dataset.caption || `第 ${current + 1} 张照片`;
    caption.textContent = photo.dataset.caption || '';
    counter.textContent = `${current + 1} / ${buttons.length}`;
    original.href = photo.dataset.original;
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('album-viewer-open');
  };
  for (const [index, button] of buttons.entries()) {
    button.addEventListener('click', (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      show(index);
    });
  }
  dialog.querySelector('[data-viewer-close]').addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-viewer-previous]').addEventListener('click', () => show(current - 1));
  dialog.querySelector('[data-viewer-next]').addEventListener('click', () => show(current + 1));
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      event.stopPropagation();
      show(current + (event.key === 'ArrowLeft' ? -1 : 1));
    }
  });
  image.addEventListener('touchstart', (event) => { touchX = event.changedTouches[0]?.clientX; }, { passive: true });
  image.addEventListener('touchend', (event) => {
    const distance = (event.changedTouches[0]?.clientX || 0) - (touchX || 0);
    if (touchX !== undefined && Math.abs(distance) > 60) show(current + (distance < 0 ? 1 : -1));
    touchX = undefined;
  }, { passive: true });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('album-viewer-open');
    image.removeAttribute('src');
  });
}

function editor() {
  const form = document.querySelector<HTMLFormElement>('[data-album-editor]');
  if (!form) return;
  const list = form.querySelector<HTMLOListElement>('[data-edit-photos]');
  const cover = form.elements.namedItem('cover') as HTMLInputElement;
  const hidden = form.elements.namedItem('photos') as HTMLInputElement;
  const upload = form.querySelector<HTMLInputElement>('[data-album-upload]');
  const save = form.querySelector<HTMLButtonElement>('[data-album-save]');
  let busy = false;
  let dirty = false;
  const items = () => list ? [...list.querySelectorAll<HTMLElement>('[data-photo-id]')] : [];
  const update = () => {
    const rows = items();
    if (!rows.some((row) => row.dataset.photoId === cover.value)) cover.value = rows[0]?.dataset.photoId || '';
    hidden.value = JSON.stringify(rows.map((row, index) => {
      const id = row.dataset.photoId;
      (row.querySelector('input[type=radio]') as HTMLInputElement).checked = id === cover.value;
      (row.querySelector('[data-photo-action=up]') as HTMLButtonElement).disabled = index === 0;
      (row.querySelector('[data-photo-action=down]') as HTMLButtonElement).disabled = index === rows.length - 1;
      row.classList.toggle('is-cover', id === cover.value);
      return { id, caption: (row.querySelector('[data-photo-caption]') as HTMLInputElement).value };
    }));
    const count = document.querySelector('[data-edit-count]');
    if (count) count.textContent = String(rows.length);
    const empty = document.querySelector<HTMLElement>('[data-edit-empty]');
    if (empty) empty.hidden = rows.length > 0;
  };
  form.addEventListener('input', () => { dirty = true; });
  form.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement;
    if (target.name === 'coverChoice') {
      cover.value = target.value;
      update();
    }
  });
  form.addEventListener('submit', (event) => {
    if (busy) event.preventDefault();
    else {
      update();
      dirty = false;
    }
  });
  window.addEventListener('beforeunload', (event) => {
    if (dirty || busy) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  const deleteForm = document.querySelector<HTMLFormElement>('[data-album-delete]');
  if (deleteForm) {
    const button = deleteForm.querySelector<HTMLButtonElement>('button');
    button.type = 'button';
    let confirming = false;
    const remove = async (event: Event) => {
      event.preventDefault();
      if (busy || confirming) return;
      confirming = true;
      try {
        const action = await new ConfirmDialog({ $body: tpl.typoMsg('确定删除这本相册吗？'), canCancel: true }).open();
        if (action !== 'yes') return;
        dirty = false;
        HTMLFormElement.prototype.submit.call(deleteForm);
      } finally {
        confirming = false;
      }
    };
    button.addEventListener('click', remove);
    deleteForm.addEventListener('submit', remove);
  }
  if (!list) return;
  list.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-photo-action]');
    if (!button) return;
    const row = button.closest<HTMLElement>('[data-photo-id]');
    if (button.dataset.photoAction === 'remove') row.remove();
    if (button.dataset.photoAction === 'up' && row.previousElementSibling) list.insertBefore(row, row.previousElementSibling);
    if (button.dataset.photoAction === 'down' && row.nextElementSibling) list.insertBefore(row.nextElementSibling, row);
    dirty = true;
    update();
  });
  let dragging: HTMLElement;
  list.addEventListener('dragstart', (event) => {
    const handle = (event.target as HTMLElement).closest('.album-drag-handle');
    if (!handle) {
      event.preventDefault();
      return;
    }
    dragging = handle.closest<HTMLElement>('[data-photo-id]');
    event.dataTransfer.setData('text/plain', dragging.dataset.photoId);
    event.dataTransfer.effectAllowed = 'move';
    dragging.classList.add('is-dragging');
  });
  list.addEventListener('dragover', (event) => {
    if (dragging) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    }
  });
  list.addEventListener('drop', (event) => {
    if (!dragging) return;
    event.preventDefault();
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-photo-id]');
    if (row && row !== dragging) {
      const box = row.getBoundingClientRect();
      list.insertBefore(dragging, event.clientX > box.left + box.width / 2 ? row.nextSibling : row);
      dirty = true;
    }
    update();
  });
  list.addEventListener('dragend', () => {
    dragging?.classList.remove('is-dragging');
    dragging = undefined;
  });
  upload.addEventListener('change', async () => {
    const files = [...upload.files];
    if (!files.length) return;
    busy = true;
    save.disabled = true;
    upload.disabled = true;
    const status = document.querySelector<HTMLElement>('[data-upload-status]');
    const progress = document.querySelector<HTMLProgressElement>('[data-upload-progress]');
    const message = document.querySelector('[data-upload-message]');
    const errors = document.querySelector('[data-upload-errors]');
    status.hidden = false;
    progress.max = files.length;
    progress.value = 0;
    errors.replaceChildren();
    let successful = 0;
    try {
      for (const [index, file] of files.entries()) {
        message.textContent = `正在上传 ${index + 1} / ${files.length}：${file.name}`;
        try {
          if (file.size > 20 * 1024 * 1024) throw new Error('图片超过 20 MB');
          const data = new FormData();
          data.set('operation', 'upload');
          data.set('revision', (form.elements.namedItem('revision') as HTMLInputElement).value);
          data.set('file', file);
          const response = await fetch(form.dataset.uploadUrl, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
          const payload = await response.json();
          if (!response.ok || !payload.photo) {
            const error = payload.error;
            throw new Error(error?.message ? i18n(error.message, ...(error.params || [])) : '上传失败，请重试');
          }
          const template = document.querySelector<HTMLTemplateElement>('[data-edit-photo-template]');
          const row = template.content.firstElementChild.cloneNode(true) as HTMLElement;
          row.dataset.photoId = payload.photo.id;
          (row.querySelector('img') as HTMLImageElement).src = payload.photo.thumb;
          (row.querySelector('input[type=radio]') as HTMLInputElement).value = payload.photo.id;
          list.append(row);
          document.querySelectorAll<HTMLInputElement>('input[name=revision]').forEach((input) => { input.value = payload.revision; });
          successful++;
          update();
        } catch (error) {
          const item = document.createElement('li');
          item.textContent = `${file.name}：${error.message}`;
          errors.append(item);
        }
        progress.value = index + 1;
      }
    } finally {
      const failures = files.length > successful ? `，${files.length - successful} 张失败` : '';
      message.textContent = `已添加 ${successful} 张照片${failures}。可继续设置封面、排序和照片说明。`;
      busy = false;
      save.disabled = false;
      upload.disabled = false;
      upload.value = '';
    }
  });
  update();
}

addPage(new NamedPage(['album_main', 'album_detail', 'album_edit', 'album_create'], () => {
  viewer();
  editor();
}));
