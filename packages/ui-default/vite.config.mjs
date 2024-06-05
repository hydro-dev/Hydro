import importMetaUrlPlugin from '@codingame/esbuild-import-meta-url-plugin';
import inject from '@rollup/plugin-inject';
import fs from 'fs';
import { globbySync } from 'globby';
import httpProxy from 'http-proxy';
import path from 'path';
import colors from 'picocolors';
// import federation from '@originjs/vite-plugin-federation';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import svgr from 'vite-plugin-svgr';
import { version } from './package.json';

const proxy = httpProxy.createProxyServer({
  ws: true,
  target: 'http://localhost:2333',
});

const setOriginHeader = (proxyReq, options) => {
  if (options.changeOrigin) {
    const { target } = options;

    if (proxyReq.getHeader('origin') && target) {
      const changedOrigin = typeof target === 'object'
        ? `${target.protocol}//${target.host}`
        : target;

      proxyReq.setHeader('origin', changedOrigin);
    }
  }
};
proxy.on('error', (err, req, originalRes) => {
  const res = originalRes;
  if (!res) {
    console.error(
      `${colors.red(`http proxy error: ${err.message}`)}\n${err.stack}`,
      {
        timestamp: true,
        error: err,
      },
    );
  } else if ('req' in res) {
    console.error(
      `${colors.red(`http proxy error: ${originalRes.req.url}`)}\n${err.stack
      }`,
      {
        timestamp: true,
        error: err,
      },
    );
    if (!res.headersSent && !res.writableEnded) {
      res
        .writeHead(500, {
          'Content-Type': 'text/plain',
        })
        .end();
    }
  } else {
    console.error(`${colors.red('ws proxy error:')}\n${err.stack}`, {
      timestamp: true,
      error: err,
    });
    res.end();
  }
});
proxy.on('proxyReq', (proxyReq, req, res, options) => {
  setOriginHeader(proxyReq, options);
});
proxy.on('proxyReqWs', (proxyReq, req, socket, options) => {
  setOriginHeader(proxyReq, options);
  socket.on('error', (err) => {
    console.error(
      `${colors.red('ws proxy socket error:')}\n${err.stack}`,
      {
        timestamp: true,
        error: err,
      },
    );
  });
});
proxy.on('proxyRes', (proxyRes, req, res) => {
  res.on('close', () => {
    if (!res.writableEnded) {
      proxyRes.destroy();
    }
  });
});

function getGlobStyle(glob = '**/*.page.styl') {
  const files = globbySync(glob, { cwd: __dirname, ignore: ['node_modules'] });
  const result = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(__dirname, file), 'utf-8');
    if (content.includes('@import \'.')) {
      result.push(`@import ${JSON.stringify(file)}`);
    } else {
      result.push(content);
    }
  }
  return `${result.filter((i) => i.startsWith('@import')).join('\n')}
${result.filter((i) => !i.startsWith('@import')).join('\n')}`;
}
function updateGlobStyle(glob, filename) {
  const file = path.join(__dirname, filename);
  const content = getGlobStyle(glob);
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf-8') !== content) {
    fs.writeFileSync(file, content);
  }
}
updateGlobStyle('**/*.page.styl', '__glob_page.styl');
updateGlobStyle('**/*.page.default.styl', '__glob_default.styl');
function getGlobPage(glob = '**/*.page.[jt]sx?') {
  const files = globbySync(glob, { cwd: __dirname, ignore: ['node_modules'] });
  const result = [];
  const exps = [];
  for (const file of files) {
    result.push(`import ${file.replace(/[/\\.-]/g, '_')} from "${file.startsWith('/') ? file : `./${file}`}";`);
    exps.push(file.replace(/[/\\.-]/g, '_'));
  }
  result.push(`export default [${exps.join(',')}]`);
  return result.join('\n');
}
function updateGlobPage(glob, filename) {
  const file = path.join(__dirname, filename);
  const content = getGlobPage(glob);
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf-8') !== content) {
    fs.writeFileSync(file, content);
  }
}
updateGlobPage(['**/*.page.js', '**/*.page.ts', '**/*.page.jsx', '**/*.page.tsx'], '__glob_page.js');

function patchPrism() {
  const langs = globbySync('prism-*.js', { cwd: import.meta.resolve('prismjs/components').split(':')[1], ignore: ['node_modules'] });
  const lines = langs.filter((i) => !i.endsWith('.min.js')).map((i) => {
    const name = i.split('prism-')[1].split('.')[0];
    return `'${name}': () => require('./${i}'),`;
  });
  const loader = `export default {
    ${lines.join('\n')}
  }`;
  fs.writeFileSync(import.meta.resolve('prismjs/components/index.js').split(':')[1], loader);
}
patchPrism();

export default defineConfig({
  root: __dirname,
  esbuild: {
    jsx: 'transform',
    loader: 'tsx',
  },
  publicDir: 'static',
  build: {
    minify: process.env.NODE_NEV === 'production',
    outDir: 'public',
    rollupOptions: {
      input: './entry.jsx',
      output: {
        globals: {
          jQuery: 'jQuery',
        },
      },
    },
  },
  resolve: {
    dedupe: ['monaco-editor', 'vscode'],
    alias: {
      vj: __dirname,
    },
  },
  define: {
    'process.env.VERSION': JSON.stringify(version),
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
    ...(process.env.NODE_ENV === 'development' ? { 'process.cwd': '()=>null' } : {}),
  },
  optimizeDeps: {
    include: ['jquery'],
    esbuildOptions: {
      plugins: [importMetaUrlPlugin],
    },
  },
  css: {
    preprocessorOptions: {
      styl: {
        use: [],
        imports: [
          // import.meta.resolve('rupture/rupture/index.styl'),
          path.join(__dirname, 'common/common.inc.styl'),
        ],
      },
    },
  },
  server: {
    host: true,
    port: 8000,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    proxy: {
    },
  },
  worker: {
    format: 'es',
  },
  plugins: [
    inject({
      $: 'jquery',
      React: 'react',
      include: ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx'],
    }),
    svgr({}),
    viteStaticCopy({
      targets: [
        { src: 'components/navigation/nav-logo-small_dark.png', dest: 'components/navigation/nav-logo-small_dark.png' },
        { src: import.meta.resolve('streamsaver/mitm.html'), dest: 'streamsaver/mitm.html' },
        { src: import.meta.resolve('streamsaver/sw.js'), dest: 'streamsaver/sw.js' },
        { src: import.meta.resolve('vditor/dist'), dest: 'vditor/dist' },
        // { from: root(`${dirname(require.resolve('graphiql/package.json'))}/graphiql.min.css`), to: 'graphiql.min.css' },
        // { from: `${dirname(require.resolve('monaco-themes/package.json'))}/themes`, to: 'monaco/themes/' },
      ],
    }),
    VitePWA({
      injectRegister: null,
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: '.',
      filename: 'service-worker.ts',
      injectManifest: {
        injectionPoint: undefined,
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
    {
      name: 'configure-server',
      watchChange(id) {
        if (id.endsWith('.styl') && !id.includes('/__')) {
          console.log('change', id);
          updateGlobStyle('**/*.page.styl', '__glob_page.styl');
          updateGlobStyle('**/*.page.default.styl', '__glob_default.styl');
        }
      },
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          // console.log(req.url);
          const resource = req.url.split('?')[0];
          if (['/@fs/', '/@vite/', '/sw.js', '/dev-sw.js', '/vditor'].some((t) => resource.startsWith(t))) next();
          else if (resource !== '/' && fs.existsSync(path.join(__dirname, resource.substring(1)))) next();
          else {
            const options = {};
            proxy.web(req, res, options);
          }
        });
        server.httpServer.on('upgrade', (req, socket, head) => {
          if (req.url !== '/') {
            proxy.ws(req, socket, head);
          }
        });
      },
    },
  ],
});
