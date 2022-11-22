import react from '@vitejs/plugin-react';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { dirname } from 'path';
import { defineConfig } from 'vite';
import monacoEditorPlugin from 'vite-plugin-monaco-editor';
import { prismjsPlugin } from 'vite-plugin-prismjs';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import svgr from 'vite-plugin-svgr';
import root from './build/utils/root';
import { version } from './package.json';

export default defineConfig({
  base: '/vite/',
  define: {
    'process.env.VERSION': JSON.stringify(version),
  },
  publicDir: 'static',
  plugins: [
    svgr(),
    react(),
    prismjsPlugin({
      languages: 'all',
      plugins: ['toolbar', 'line-highlight'],
    }),
    monacoEditorPlugin({
      customWorkers: [{
        label: 'yaml',
        entry: require.resolve('monaco-yaml/yaml.worker.js'),
      }],
    }),
    {
      name: 'ServerProxy',
      configureServer(server) {
        server.middlewares.use(
          '/',
          createProxyMiddleware((url) => !url.startsWith('/vite/'), {
            target: 'http://127.0.0.1:2334/',
            ws: true,
          }) as any,
        );
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
