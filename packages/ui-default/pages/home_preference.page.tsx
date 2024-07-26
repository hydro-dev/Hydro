import $ from 'jquery';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { renderLanguageSelect } from 'vj/components/languageselect';
import Dom from 'vj/components/react/DomComponent';
import { NamedPage } from 'vj/misc/Page';
import {
  delay, getAvailableLangs, i18n, tpl,
} from 'vj/utils';

async function initCodeLangHelper() {
  const $el = $(tpl`<div className="row" id="codelang-select"></div>`);
  $('[name="codeLang"]')
    .parent().parent().parent()
    .parent()
    .hide()
    .after($el);

  const main = {};
  for (const key in window.LANGS) {
    if (!key.includes('.') && !window.LANGS[key].hidden) main[key] = window.LANGS[key].display;
  }

  await delay(50);
  renderLanguageSelect(
    document.getElementById('codelang-select'),
    $('[name="codeLang"]'),
    getAvailableLangs(),
    main,
    [$('[name="codeLang"]').val()],
  );
}

function supportFontFamily(f) {
  const h = 'Arial';
  if (f.toLowerCase() === h.toLowerCase()) return true;
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 100;
  const ctx = canvas.getContext('2d');
  ctx.textAlign = 'center';
  ctx.fillStyle = 'black';
  ctx.textBaseline = 'middle';
  const g = (j) => {
    ctx.clearRect(0, 0, 100, 100);
    ctx.font = `100px ${j}, ${h}`;
    ctx.fillText('a', 50, 50);
    const k = ctx.getImageData(0, 0, 100, 100).data;
    return [].slice.call(k).filter((l) => l !== 0);
  };
  return g(h).join('') !== g(f).join('');
}

interface HighlightProps {
  theme: string;
  setAvailableThemes: (themes: string[]) => void;
}
function HighlightPreview(props: HighlightProps) {
  const [ready, setReady] = React.useState(false);
  const [html, setHtml] = React.useState(tpl`<pre><code></code></pre>`);
  const [code, setCode] = React.useState('');
  const [module, setShikiModule] = React.useState(null);
  const [rerender, setRerender] = React.useState(0);

  React.useEffect(() => {
    $('[name="showInvisibleChar"]').on('change', (ev) => {
      UserContext.showInvisibleChar = ev.target.checked;
      setRerender((i) => i + 1);
    });
    Promise.all([
      import('vj/components/highlighter/shiki'),
      import('vj/components/highlighter/code-example'),
    ]).then(([m, { default: c }]) => {
      setShikiModule(m);
      setCode(c);
      props.setAvailableThemes(Object.keys(m.bundledThemes));
    });
  }, []);
  React.useEffect(() => {
    setReady(false);
    let theme = props.theme;
    if (!module?.bundledThemes?.[theme]) theme = 'light-plus';
    module?.createHighlighter({ langs: ['cpp'], themes: [theme] }).then((shiki) => {
      setHtml(shiki.codeToHtml(code, { lang: 'cpp', theme, transformers: module.getTransformers() }));
      setReady(true);
    });
  }, [props.theme, module, code, rerender]);
  return <div style={{ width: '100%' }}>
    {(!ready) && <div className="loader-container" style={{ position: 'absolute' }}><div className="loader"></div></div>}
    <div style={{ overflow: 'auto', maxHeight: '80vh' }} dangerouslySetInnerHTML={{ __html: html }}></div>
  </div>;
}

const page = new NamedPage('home_preference', () => {
  const div = document.createElement('div');

  function App() {
    const [highlightTheme, setHighlightTheme] = React.useState(UserContext.highlightTheme);
    const [themes, setAvailableThemes] = React.useState([]);

    React.useEffect(() => {
      // document.fonts.onloadingdone = () => setProbeFont((i) => i + 1);
      $('[name="highlightTheme"]').on('change', (ev) => {
        setHighlightTheme(ev.target.value);
      });
    }, []);
    React.useEffect(() => {
      UserContext.highlightTheme = highlightTheme;
    }, [highlightTheme]);

    return <div>
      <Dom childDom={$('#setting_display').parent().get(0)} />
      <div className="section__body">
        <div className="row">
          <div className="medium-5 columns form__item">
            <Dom childDom={$('[name="form_item_viewLang"]').parent().get(0)} />
          </div>
          <div className="medium-5 columns form__item end">
            <Dom childDom={$('[name="form_item_theme"]').parent().get(0)} />
          </div>
        </div>
        <div className="row">
          <div className="medium-5 columns form__item end">
            <Dom childDom={$('[name="form_item_timeZone"]').parent().get(0)} />
          </div>
        </div>
        <div className="row">
          <div className="medium-5 columns form__item">
            <Dom childDom={$('[name="form_item_fontFamily"]').parent().get(0)} />
          </div>
          <div className="medium-5 columns form__item end">
            <Dom childDom={$('[name="form_item_codeFontFamily"]').parent().get(0)} />
          </div>
        </div>

        <div className="row">
          <div className="medium-5 columns form__item">
            <Dom childDom={$('[name="form_item_skipAnimate"]').parent().get(0)} />
          </div>
          <div className="medium-5 columns form__item end">
            <Dom childDom={$('[name="form_item_showTimeAgo"]').parent().get(0)} />
          </div>
        </div>
      </div>
      <div className="section__header">
        <h1>test</h1>
      </div>
      <div className="section__body">
        <div className="row">
          <div className="medium-4 columns form__item">
            <Dom childDom={$('[name="form_item_showInvisibleChar"]').parent().get(0)} />
          </div>
          <div className="medium-4 columns form__item">
            <Dom childDom={$('[name="form_item_codeFontLigatures"]').parent().get(0)} />
          </div>
          <div className="medium-4 columns form__item end">
            <Dom childDom={$('[name="form_item_formatCode"]').parent().get(0)} />
          </div>
        </div>
        <div className="row">
          <div className="medium-4 columns form__item">
            {themes.length ? <label>
              {i18n('highlightTheme')}
              <select value={highlightTheme} onChange={(ev) => { setHighlightTheme(ev.target.value); }} name="highlightTheme" className="select">
                {themes.map((theme) => <option key={theme} value={theme}>{theme}</option>)}
              </select>
            </label>
              : <Dom childDom={$('[name="form_item_highlightTheme"]').parent().get(0)} />}
          </div>
        </div>
        <React.Suspense fallback={<p>Loading preview</p>}>
          <HighlightPreview theme={highlightTheme} setAvailableThemes={setAvailableThemes} />
        </React.Suspense>
      </div>
    </div>;
  }

  $('form[method="post"]').prepend(div);
  ReactDOM.createRoot(div).render(<App />);
  initCodeLangHelper();
  $('[name="fontFamily"] option, [name="codeFontFamily"] option').each(function () {
    if (!supportFontFamily(this.value)) {
      $(this).hide();
      console.log(`Unsupported: ${this.value}`);
    }
    this.style.fontFamily = this.getAttribute('value');
    this.textContent = i18n(this.textContent.trim());
  });
  function updateFont() {
    this.style.fontFamily = $(this).val();
  }
  document.fonts.onloadingdone = () => {
    $('[name="fontFamily"] option, [name="codeFontFamily"] option').each(function () {
      if (supportFontFamily(this.value)) $(this).show();
    });
  };
  $('[name="fontFamily"], [name="codeFontFamily"]').on('change', updateFont).each(updateFont);
});

export default page;
