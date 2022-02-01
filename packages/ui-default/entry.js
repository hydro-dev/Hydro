window.Hydro = {
  extraPages: [],
  preload: [],
  components: {},
  utils: {},
  node_modules: {},
};
window.externalModules = {};

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

document.addEventListener('DOMContentLoaded', async () => {
  window.UiContext = JSON.parse(window.UiContext);

  const PageLoader = '<div class="page-loader nojs--hide" style="display:none;"><div class="loader"></div></div>';
  $('body').prepend(PageLoader);
  $('.page-loader').fadeIn(500);
  // eslint-disable-next-line camelcase
  try { __webpack_public_path__ = UiContext.cdn_prefix; } catch (e) { }

  const local = JSON.parse(localStorage.getItem('hydro-constant') || '{}');
  let { data } = local;
  if (local.version !== UiContext.constantVersion) {
    const res = await fetch(`/constant?version=${UiContext.constantVersion}`);
    data = await res.json();
    localStorage.setItem('hydro-constant', JSON.stringify({ data, version: UiContext.constantVersion }));
  }
  eval(data[0]); // eslint-disable-line no-eval
  data.shift();
  window.Hydro.preload = data;

  const e = document.createElement('style');
  const dark = UiContext.domain.nav_logo_dark || UiContext.nav_logo_dark;
  const dark2x = UiContext.domain.nav_logo_dark_2x || UiContext.nav_logo_dark_2x;
  e.innerHTML = `
    ${dark ? `.nav__logo { background-image: url(${dark}) !important }` : ''}
    ${dark2x ? `
      @media
      only screen and (-webkit-min-device-pixel-ratio: 1.5), 
      only screen and (min-resolution: 1.5dppx),
      only screen and (min-resolution: 144dpi) {
        .nav__logo, .header--mobile__domain {
          background-image: url(${dark2x}) !important
        }
      }` : ''}`;
  document.body.appendChild(e);

  import('./hydro');
}, false);
