import $ from 'jquery';
import Notification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import {
  delay, i18n, request, tpl,
} from 'vj/utils';

export default new NamedPage('home_account', () => {
  document.getElementsByName('avatar')[0].parentNode.parentNode.parentElement.remove();
  const $type = $(tpl`
    <select id="type" class="select">
      <option value="gravatar">${i18n('Gravatar')}</option>
      <option value="github">${i18n('GitHub')}</option>
      <option value="qq">${i18n('QQ')}</option>
      <option value="upload">${i18n('Upload')}</option>
    </select>
  `);
  const $text = $(tpl`<input type="text" class="textbox" placeholder="${i18n('Avatar URL')}">`);
  const $layout = $(`
    <div class="row">
      ${[['type', 3], ['text', 6], ['btn', 3]].map(([i, w]) => `
        <div class="medium-${w} columns form__item">
          <div name="form_item_${i}"></div>
        </div>
      `).join(' ')}
    </div>
  `);
  const $file: JQuery<HTMLInputElement> = $('<input type="file" style="display:none" accept=".jpg,.jpeg,.png">');
  const $confirm = $(tpl`<button class="button rounded primary">${i18n('Confirm')}</button>`);
  $('button.change-avatar').on('click', () => {
    $('.changeAvatar').append($layout);
    $('[name="form_item_type"]').append($type);
    $('[name="form_item_text"]').append($text);
    $('[name="form_item_text"]').append($file);
    $('[name="form_item_btn"]').append($confirm);
    $('button.change-avatar').hide();
    $type.trigger('change');
  });
  $type.on('change', () => {
    if ($type.val() === 'upload') {
      $text.hide();
      $file.show();
    } else {
      $text.show();
      $file.hide();
      const placeholder = $type.val() === 'gravatar'
        ? 'Email address'
        : $type.val() === 'github'
          ? 'GitHub username'
          : 'QQ ID';
      $text.attr('placeholder', i18n(placeholder));
    }
  });
  $confirm.on('click', async () => {
    if ($type.val() === 'upload') {
      const formData = new FormData();
      formData.append('file', $file[0].files[0]);
      await request.postFile('/home/avatar', formData);
      Notification.success(i18n('Upload success.'));
    } else {
      await request.post('/home/avatar', {
        avatar: `${$type.val()}:${$text.val()}`,
      });
      Notification.success(i18n('Updated.'));
    }
    await delay(800);
    window.location.reload();
  });
});
