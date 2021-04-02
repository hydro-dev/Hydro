const httpProxy = require('http-proxy');
const fs = require('fs');

const reactRefreshLoc = require.resolve('react-refresh/cjs/react-refresh-runtime.development.js');
const reactRefreshCode = `
function d(e,t){let u;return()=>{clearTimeout(u),u=setTimeout(e,t)}};
{ const exports = {};
exports.performReactRefresh=d(exports.performReactRefresh,30);\
${fs.readFileSync(reactRefreshLoc, { encoding: 'utf-8' })
    .replace('process.env.NODE_ENV', JSON.stringify('development'))}
window.$RefreshRuntime$=exports;\
window.$RefreshRuntime$.injectIntoGlobalHook(window);\
window.$RefreshReg$=()=>{};\
window.$RefreshSig$=()=>t=>t; }`;

const proxy = httpProxy.createServer({ target: 'http://localhost:2333' });
const dest = (req, res) => proxy.web(req, res, undefined, (e) => console.error(e.message));
const refresh = (req, res) => {
  res.write(reactRefreshCode);
  res.end();
};
const hmr = async (req, res) => {
  // eslint-disable-next-line no-multi-str
  req.headers.hmr = Buffer.from('<script src="/react-refresh.js"></script>').toString('base64');
  proxy.web(req, res, undefined, (e) => console.error(e.message));
};

module.exports = {
  entry: 'hydro.js',
  env: process.env,
  plugins: [
    ['./build/plugins/require-context.snowpack', { input: ['misc/PageLoader.js'] }],
    './build/plugins/provide.snowpack',
    '@snowpack/plugin-react-refresh',
  ],
  alias: { vj: __dirname },
  routes: [
    ['/.*', 'routes', hmr],
    ['/react-refresh\\.js', 'all', refresh],
    ['.+\\.(png|css|json|woff2|woff|ttf)', 'all'],
    ['(/ui-constants\\.js|/locale/.*)', 'all'],
  ].map(([src, match, handle]) => ({ src, match, dest: handle || dest })),
};
