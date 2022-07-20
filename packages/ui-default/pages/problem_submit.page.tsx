import React from 'react';
import ReactDOM from 'react-dom/client';
import i18n from 'vj/utils/i18n';
import { NamedPage } from 'vj/misc/Page';
import getAvailableLangs from 'vj/utils/availableLangs';

const page = new NamedPage(['problem_submit', 'contest_detail_problem_submit', 'homework_detail_problem_submit'], async () => {
  const { config } = UiContext.pdoc;
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

  const [firstLoadMain, firstLoadSub] = (() => {
    for (const preference of preferences) {
      if (preference.includes('.')) {
        const [l, r] = preference.split('.');
        if (availableLangs[preference]) return [l, r];
        if (availableLangs[l]) return [l, ''];
      } else if (availableLangs[preference]) {
        return [preference, ''];
      }
    }
    return [Object.keys(mainLangs)[0], ''];
  })();

  function LanguageSelect() {
    const [main, setMain] = React.useState(firstLoadMain);
    const [sub, setSub] = React.useState(firstLoadSub);

    const options = {};
    for (const key in availableLangs) {
      if (key.startsWith(`${main}.`)) options[key.split('.')[1]] = availableLangs[key].display;
    }
    React.useEffect(() => {
      $('[name="lang"]').val(sub ? `${main}.${sub}` : main);
    }, [main, sub]);
    React.useEffect(() => {
      const subselections = Object.keys(options).length;
      if (options[sub]) return;
      if (!subselections) setSub('');
      if (subselections === 1) setSub(Object.keys(options)[0]);
    }, [main]);

    return (
      <>
        {Object.keys(mainLangs).length > 1 && (
          <div className="medium-5 columns form__item end">
            <label>
              {i18n('Code language')}
              <div className="select-container">
                <select value={main} onChange={(ev) => setMain(ev.target.value)} className="select">
                  {Object.keys(mainLangs).map((key) => (
                    <option key={key} value={key}>{mainLangs[key]}</option>
                  ))}
                </select>
              </div>
            </label>
          </div>
        )}
        {(Object.keys(options).length > 1 || Object.keys(mainLangs).length === 1) && (
          <div className="medium-5 columns form__item end">
            <label>
              {i18n('Code language')}
              <div className="select-container">
                <select value={sub} onChange={(ev) => setSub(ev.target.value)} className="select">
                  {Object.keys(options).map((i) => (
                    <option value={i} key={i}>{options[i]}</option>
                  ))}
                </select>
              </div>
            </label>
          </div>
        )}
      </>
    );
  }

  ReactDOM.createRoot(document.getElementById('codelang-selector')).render(<LanguageSelect />);
});

export default page;
