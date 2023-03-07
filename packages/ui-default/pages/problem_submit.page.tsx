import $ from 'jquery';
import { renderLanguageSelect } from 'vj/components/languageselect';
import { NamedPage } from 'vj/misc/Page';
import { getAvailableLangs } from 'vj/utils';

const page = new NamedPage(['problem_submit', 'contest_detail_problem_submit', 'homework_detail_problem_submit'], async () => {
  const { config } = UiContext.pdoc;
  if (config.type === 'submit_answer') {
    $('[name="lang"]').val('_');
    return;
  }
  const availableLangs = getAvailableLangs(config.langs);
  const mainLangs = {};
  const preferences = [($('[name="lang"]').val() as string) || ''];
  for (const key in availableLangs) {
    if (config.langs && !config.langs.filter((i) => i === key || i.startsWith(`${key}.`)).length) continue;
    if (window.LANGS[key].pretest === preferences[0]) preferences.push(key);
    if (!key.includes('.')) mainLangs[key] = window.LANGS[key].display;
    else {
      const a = key.split('.')[0];
      mainLangs[a] = window.LANGS[a].display;
    }
  }
  for (const key in availableLangs) {
    if (config.langs && !config.langs.filter((i) => i === key || i.startsWith(`${key}.`)).length) continue;
    if (window.LANGS[key].pretest?.split('.')[0] === preferences[0].split('.')[0]) preferences.push(key);
  }

  $('.codelang-selector').each((i, e) => {
    console.log('renderLanguageSelect', e);
    renderLanguageSelect(
      e,
      `[name="lang.${e.id}"]`,
      availableLangs,
      mainLangs,
      preferences,
    );
  });
});

export default page;
