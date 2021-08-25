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

  const { domainId } = UiContext.pdocConfig;

  function onChangeMain(update = true) {
    const options = {};
    for (const key in window.LANGS) {
      if (UiContext.pdocConfig.langs && !UiContext.pdocConfig.langs.includes(key)) continue;
      if (window.LANGS[key].domain && !window.LANGS[key].domain.includes(domainId)) continue;
      if (key.startsWith(`${this.value}.`) && key !== this.value) options[key] = window.LANGS[key].display;
    }
    setOptions($('#codelang-sub-select'), options);
    if (Object.keys(options).length) {
      $('#codelang-sub-container').show();
      if (update) $('[name="lang"]').val($('#codelang-sub-select').val());
    } else {
      $('#codelang-sub-container').hide();
      if (update) $('[name="lang"]').val(this.value);
    }
    return Object.keys(options)[0];
  }
  const main = {};
  for (const key in window.LANGS) {
    if (UiContext.pdocConfig.langs && !UiContext.pdocConfig.langs.filter((i) => i === key || i.startsWith(`${key}.`)).length) continue;
    if (window.LANGS[key].domain && !window.LANGS[key].domain.includes(domainId)) continue;
    if (!key.includes('.')) main[key] = window.LANGS[key].display;
  }
  setOptions($('#codelang-main-select'), main);

  const current = $('[name="lang"]').val();
  if (current.includes('.')) {
    const [m] = current.split('.');
    $('#codelang-main-select').val(m);
    const fallback = onChangeMain.call({ value: m }, false);
    $('#codelang-sub-select').val(current);
    if (fallback && !$('#codelang-sub-select').val()) {
      $('#codelang-sub-select').val(fallback);
      $('[name="lang"]').val(fallback);
    }
  } else $('#codelang-main-select').val(current);

  $('#codelang-main-select').on('change', onChangeMain);
  $('#codelang-sub-select').on('change', function () {
    $('[name="lang"]').val(this.value);
  });
});

export default page;
