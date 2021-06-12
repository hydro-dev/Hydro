import { NamedPage } from 'vj/misc/Page';

function setOptions($el, options) {
  $el.empty();
  $.each(options, (key, value) => {
    $el.append($('<option></option>').attr('value', key).text(value));
  });
}

const page = new NamedPage(['problem_submit', 'contest_detail_problem_submit', 'homework_detail_problem_submit'], async () => {
  $(document).on('click', '[name="problem-sidebar__show-category"]', (ev) => {
    $(ev.currentTarget).hide();
    $('[name="problem-sidebar__categories"]').show();
  });
  function onChangeMain() {
    const options = {};
    for (const key in window.LANGS) {
      if (UiContext.pdocConfig.langs && !UiContext.pdocConfig.langs.includes(key)) continue;
      if (key.startsWith(`${this.value}.`) && key !== this.value) options[key] = window.LANGS[key].display;
    }
    if (Object.keys(options).length > 1) {
      setOptions($('#codelang-sub-select'), options);
      $('#codelang-sub-container').show();
      $('[name="lang"]').val($('#codelang-sub-select').val());
    } else {
      $('#codelang-sub-container').hide();
      $('[name="lang"]').val(this.value);
    }
  }
  $('#codelang-main-select').on('change', onChangeMain);
  $('#codelang-sub-select').on('change', function () {
    $('[name="lang"]').val(this.value);
  });
  const main = {};
  const prefix = new Set(Object.keys(window.LANGS).filter((i) => i.includes('.')).map((i) => i.split('.')[0]));
  for (const key in window.LANGS) {
    if (UiContext.pdocConfig.langs && !prefix.has(key) && !UiContext.pdocConfig.langs.includes(key)) continue;
    if (!key.includes('.')) main[key] = window.LANGS[key].display;
  }
  setOptions($('#codelang-main-select'), main);
  const current = $('[name="lang"]').val();
  if (current.includes('.')) {
    const [m] = current.split('.');
    $('#codelang-main-select').val(m);
    onChangeMain.call({ value: $('#codelang-main-select').val() });
    $('#codelang-sub-select').val(current);
  } else $('#codelang-main-select').val(current);
});

export default page;
