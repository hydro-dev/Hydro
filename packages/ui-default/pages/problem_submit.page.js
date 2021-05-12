import { NamedPage } from 'vj/misc/Page';

function setOptions($el, options) {
  $el.empty();
  $.each(options, (key, value) => {
    $el.append($('<option></option>').attr('value', key).text(value));
  });
}

const page = new NamedPage(['problem_submit', 'contest_detail_problem_submit'], async () => {
  $(document).on('click', '[name="problem-sidebar__show-category"]', (ev) => {
    $(ev.currentTarget).hide();
    $('[name="problem-sidebar__categories"]').show();
  });
  $('#codelang-main-select').on('change', function () {
    $('[name="lang"]').val(this.value);
    const options = {};
    for (const key in window.LANGS) {
      if (key.startsWith(`${this.value}.`) && key !== this.value) options[key] = window.LANGS[key].display;
    }
    if (Object.keys(options).length > 1) {
      setOptions($('#codelang-sub-select'), options);
      $('#codelang-sub-container').show();
    } else $('#codelang-sub-container').hide();
  });
  $('#codelang-sub-select').on('change', function () {
    $('[name="lang"]').val(this.value);
  });
  const main = {};
  for (const key in window.LANGS) {
    if (!key.includes('.')) main[key] = window.LANGS[key].display;
  }
  setOptions($('#codelang-main-select'), main);
  const current = $('[name="lang"]').val();
  if (current.includes('.')) {
    const [m, s] = current.split('.');
    $('#codelang-main-select').val(m);
    $('#codelang-sub-select').val(s).show();
  } else $('#codelang-main-select').val(current);
});

export default page;
