import $ from 'jquery';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { i18n } from 'vj/utils';

export default function LanguageSelect({
  fieldSelector, firstLoadMain, firstLoadSub, availableLangs, mainLangs,
}) {
  const [main, setMain] = React.useState(firstLoadMain);
  const [sub, setSub] = React.useState(firstLoadSub);

  const options = {};
  for (const key in availableLangs) {
    if (key.startsWith(`${main}.`)) options[key.split('.')[1]] = availableLangs[key].display;
  }
  React.useEffect(() => {
    $(fieldSelector).val(sub ? `${main}.${sub}` : main);
  }, [main, sub]);
  React.useEffect(() => {
    const subselections = Object.keys(options).length;
    if (options[sub]) return;
    if (!subselections) setSub('');
    setSub(Object.keys(options)[0]);
  }, [main]);

  return (
    <>
      {(Object.keys(mainLangs).length > 1 || Object.keys(options).length === 1) && (
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
              {Object.keys(options).length
                ? <select value={sub} onChange={(ev) => setSub(ev.target.value)} className="select">
                  {Object.keys(options).map((i) => (
                    <option value={i} key={i}>{options[i]}</option>
                  ))}
                </select>
                : <select value={main} onChange={(ev) => setMain(ev.target.value)} className="select">
                  {Object.keys(mainLangs).map((i) => (
                    <option value={i} key={i}>{mainLangs[i]}</option>
                  ))}
                </select>}
            </div>
          </label>
        </div>
      )}
    </>
  );
}

export function renderLanguageSelect(onElement, fieldSelector, availableLangs, mainLangs, preferences) {
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
    const selected = Object.keys(mainLangs)[0];
    for (const key in availableLangs) {
      if (key.startsWith(`${selected}.`)) return [selected, key.split('.')[1]];
    }
    return [selected, ''];
  })();

  ReactDOM.createRoot(onElement).render(
    <LanguageSelect
      fieldSelector={fieldSelector}
      mainLangs={mainLangs}
      availableLangs={availableLangs}
      firstLoadMain={firstLoadMain}
      firstLoadSub={firstLoadSub}
    />,
  );
}
