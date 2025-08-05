import $ from 'jquery';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { renderLanguageSelect } from 'vj/components/languageselect';
import { NamedPage } from 'vj/misc/Page';
import { getAvailableLangs, i18n, tpl } from 'vj/utils';

const page = new NamedPage(['problem_submit', 'contest_detail_problem_submit', 'homework_detail_problem_submit'], async () => {
  const { config } = UiContext.pdoc;
  if (config.type === 'submit_answer') {
    $('[name="lang"]').val('_');
    return;
  }
  const availableLangs = getAvailableLangs(config.langs);
  const mainLangs = {};
  const preferences = [UserContext.codeLang || ''];
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
    if (typeof window.LANGS[key]?.pretest === 'string' && window.LANGS[key].pretest.split('.')[0] === preferences[0].split('.')[0]) {
      preferences.push(key);
    }
  }

  renderLanguageSelect(
    document.getElementById('codelang-selector'),
    '[name="lang"]',
    availableLangs,
    mainLangs,
    preferences,
  );

  if (localStorage.getItem('submit-hint') === 'dismiss') return;
  $(tpl`<div name="hint" class="typo"></div>`).prependTo('[name="submit_section"]');
  const root = ReactDOM.createRoot(document.querySelector('[name="hint"]'));
  function ignore() {
    root.unmount();
    localStorage.setItem('submit-hint', 'dismiss');
  }

  root.render(<blockquote className="note">
    <p>{i18n('This page is only for pasting code from other sources.')}</p>
    <p>{i18n("To get a better editing experience, with code highlighting and test runs, \
please go back to the problem detail page and use 'Open Scratchpad' button.")}
    </p>
    <a onClick={() => root.unmount()}>{i18n('Dismiss')}</a> / <a onClick={ignore}>{i18n("Don't show again")}</a>
  </blockquote>);
});

export default page;
