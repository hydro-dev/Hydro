import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import compression from 'compression';
import fs from 'fs/promises';
import { mkdirs } from 'fs-extra';
import proxy from 'http2-proxy';
import template from 'lodash/template';
import { dirname, join, resolve } from 'path';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import svgr from 'vite-plugin-svgr';
import root from './build/utils/root';
import { version } from './package.json';

const virtualModulesPath = resolve('node_modules/@virtual');
const generateVirtualModule = async (name: string, source: string) => {
  const moduleRoot = join(virtualModulesPath, name);
  await mkdirs(moduleRoot);
  await fs.writeFile(join(moduleRoot, 'package.json'), JSON.stringify({ name: `@virtual/${name}`, version: '0.0.0', main: 'index.js' }));
  await fs.writeFile(join(moduleRoot, 'index.js'), template(source, { evaluate: /\{\{(.+?)\}\}/g, interpolate: /\{\{\+(.+?)\}\}/g })({ require }));
};

const target = 'http://127.0.0.1:2333/';
const targetUrl = new URL(target);
export default async () => {
  await Promise.all((await fs.readdir('build/virtual-modules'))
    .map((it) => fs.readFile(join('build/virtual-modules', it), 'utf-8')
      .then((data) => generateVirtualModule(it.replace(/\.js$/, ''), data))));

  return defineConfig({
    base: '/vite/',
    publicDir: 'static',
    server: { https: true, host: true },
    define: {
      'process.env.VERSION': JSON.stringify(version),
    },
    plugins: [
      svgr(),
      react(),
      basicSsl(),
      {
        name: 'ServerProxy',
        enforce: 'pre',
        configureServer(server) {
          server.httpServer.on('upgrade', (req, socket, head) => {
            if (req.url.startsWith('/vite/')) return;
            proxy.ws(req, socket as any, head, {
              hostname: targetUrl.hostname,
              port: +targetUrl.port,
            }, (err) => err && console.error(err));
          });
          server.middlewares.use('/', (req, res, next) => {
            if (!('_implicitHeader' in res)) {
              (res as any)._implicitHeader = function () {
                this.writeHead(this.statusCode);
              };
            }
            return next();
          });
          server.middlewares.use(compression({ level: 9 }));
          server.middlewares.use('/', (req, res, next) => {
            if (req.url.startsWith('/vite/')) {
              next();
              return;
            }
            const url = req.url.replace(/^\/+/, '');
            const { pathname, search } = new URL(url, target);
            delete req.headers.referer;
            proxy.web(
              req,
              res,
              {
                protocol: targetUrl.protocol.slice(0, -1) as 'http' | 'https',
                port: +targetUrl.port,
                hostname: targetUrl.hostname,
                path: pathname + search,
              },
              (err) => err && next(err),
            );
          });
        },
      },
      viteStaticCopy({
        targets: [
          { src: root('components/navigation/nav-logo-small_dark.png'), dest: 'components/navigation/nav-logo-small_dark.png' },
          { src: root(`${dirname(require.resolve('streamsaver/package.json'))}/mitm.html`), dest: 'streamsaver/mitm.html' },
          { src: root(`${dirname(require.resolve('streamsaver/package.json'))}/sw.js`), dest: 'streamsaver/sw.js' },
          { src: root(`${dirname(require.resolve('vditor/package.json'))}/dist`), dest: 'vditor/dist' },
          { src: root(`${dirname(require.resolve('graphiql/package.json'))}/graphiql.min.css`), dest: 'graphiql.min.css' },
          { src: `${dirname(require.resolve('monaco-themes/package.json'))}/themes`, dest: 'monaco/themes/' },
        ],
      }),
    ],
    resolve: {
      alias: {
        vj: root(),
      },
    },
    build: {
      manifest: true,
      rollupOptions: {
        input: {
          hydro: './entry.js',
          'service-worker': './service-worker.ts',
          'messages-shared-worker': './components/message/worker.ts',
        },
      },
    },
    css: {
      preprocessorOptions: {
        styl: {
          imports: [require.resolve('rupture/rupture/index.styl'), root('common/common.inc.styl')],
        },
      },
    },
  });
};
