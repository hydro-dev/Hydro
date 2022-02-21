import { NamedPage } from 'vj/misc/Page';
import i18n from 'vj/utils/i18n';
import tpl from 'vj/utils/tpl';

function initCodeLangHelper() {
  function setOptions($el, options) {
    $el.empty();
    $.each(options, (key, value) => {
      $el.append($('<option></option>').attr('value', key).text(value));
    });
  }

  const $el = $(tpl`\
<div class="row">
  <div class="medium-5 columns form__item end">
    <label>
      ${i18n('Code language')}
      <div name="form_item_lang" class="select-container">
        <select id="codelang-main-select" class="select"></select>
      </div>
    </label>
  </div>
  <div class="medium-5 columns form__item end" style="display: none" id="codelang-sub-container">
    <label>
      ${i18n('Code language')}
      <div name="form_item_lang" class="select-container">
        <select id="codelang-sub-select" class="select"></select>
      </div>
    </label>
  </div>
</div>
`);
  $('[name="codeLang"]')
    .parent().parent().parent()
    .parent()
    .hide()
    .after($el);

  function onChangeMain(update = true) {
    const options = {};
    for (const key in window.LANGS) {
      if (key.startsWith(`${this.value}.`) && key !== this.value) options[key] = window.LANGS[key].display;
    }
    if (Object.keys(options).length > 1) {
      setOptions($('#codelang-sub-select'), options);
      $('#codelang-sub-container').show();
      if (update) $('[name="codeLang"]').val($('#codelang-sub-select').val());
    } else {
      $('#codelang-sub-container').hide();
      if (update) $('[name="codeLang"]').val(this.value);
    }
  }
  const main = {};
  for (const key in window.LANGS) {
    if (!key.includes('.')) main[key] = window.LANGS[key].display;
  }
  setOptions($('#codelang-main-select'), main);
  const current = $('[name="codeLang"]').val();
  if (current.includes('.')) {
    const [m] = current.split('.');
    $('#codelang-main-select').val(m);
    onChangeMain.call({ value: m }, false);
    $('#codelang-sub-select').val(current);
  } else $('#codelang-main-select').val(current);
  $('#codelang-main-select').on('change', onChangeMain);
  $('#codelang-sub-select').on('change', function () {
    $('[name="codeLang"]').val(this.value);
  });
}

const page = new NamedPage('home_preference', () => {
  initCodeLangHelper();
  $('[name="fontFamily"] option, [name="codeFontFamily"] option').each(function () {
    this.style.fontFamily = this.getAttribute('value');
    this.textContent = i18n(this.textContent.trim());
  });
  function updateFont() {
    this.style.fontFamily = $(this).val();
  }
  $('[name="fontFamily"], [name="codeFontFamily"]').on('change', updateFont).each(updateFont);
});

export default page;
