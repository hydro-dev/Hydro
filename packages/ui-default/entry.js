window.Hydro = {
  extraPages: [],
  preload: [],
  components: {},
  utils: {},
  node_modules: {},
};

console.log(
  '%c%s%c%s',
  'color:red;font-size:24px;',
  '   Welcome to\n',
  'color:blue;font-weight:bold;', `\
    __  __          __         
   / / / /_  ______/ /________ 
  / /_/ / / / / __  / ___/ __ \\
 / __  / /_/ / /_/ / /  / /_/ /
/_/ /_/\\__, /\\__,_/_/   \\____/ 
      /____/                   
`,
);

document.addEventListener('DOMContentLoaded', () => {
  window.UiContext = JSON.parse(window.UiContext);

  // eslint-disable-next-line
  try { __webpack_public_path__ = UiContext.cdn_prefix } catch (e) { }

  // Locale & langs
  const { version, payload } = JSON.parse(localStorage.getItem('hydro-constant') || '{}');
  if (version === UiContext.constantVersion) {
    eval(payload[0]); // eslint-disable-line no-eval
    payload.shift();
    window.Hydro.preload = payload;
    import('./hydro');
  } else {
    fetch(`/constant?version=${UiContext.constantVersion}`)
      .then((res) => res.json())
      .then((data) => {
        eval(data.payload[0]); // eslint-disable-line no-eval
        localStorage.setItem('hydro-constant', JSON.stringify(data));
        data.payload.shift();
        window.Hydro.preload = data.payload;
        import('./hydro');
      });
  }
}, false);
