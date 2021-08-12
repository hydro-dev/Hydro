window.Hydro = {
  extraPages: [],
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

window.UiContext = JSON.parse(window.UiContext);

// eslint-disable-next-line
try { __webpack_public_path__ = UiContext.cdn_prefix } catch (e) { }

import('./hydro');
