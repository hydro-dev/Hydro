/* eslint-disable global-require */
import { sentryWebpackPlugin } from '@sentry/webpack-plugin';
import { CleanWebpackPlugin } from 'clean-webpack-plugin';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import { version as coreJsVersion } from 'core-js/package.json';
import compat from 'core-js-compat';
import { EsbuildPlugin } from 'esbuild-loader';
import fs from 'fs';
import { DuplicatesPlugin } from 'inspectpack/plugin';
import ExtractCssPlugin from 'mini-css-extract-plugin';
import packageJson from 'package-json';
import { dirname } from 'path';
import { gt } from 'semver';
import webpack from 'webpack';
import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer';
import { WebpackManifestPlugin } from 'webpack-manifest-plugin';
import WebpackBar from 'webpackbar';
import { version } from '../../package.json';
import root from '../utils/root';

const {
  list,
  targets,
} = compat({
  targets: '> 1%, chrome 70, firefox 60, safari 16, ios_saf 16, not ie 11, not op_mini all',
  modules: [
    'core-js/stable',
  ],
  exclude: [],
  version: coreJsVersion,
  inverse: false,
});
fs.writeFileSync(root('__core-js.js'), `${list.map((i) => `import 'core-js/modules/${i}';`).join('\n')}\n`);

export default async function (env: { watch?: boolean, production?: boolean, measure?: boolean } = {}) {
  if (env.production) console.log(targets);
  let isNew = false;
  const { version: latest } = await packageJson('@hydrooj/ui-default', { version: 'latest' });
  if (typeof version === 'string' && gt(version, latest)) isNew = true;

  function cssLoader() {
    return {
      loader: 'css-loader',
      options: { importLoaders: 1 },
    };
  }

  function postcssLoader() {
    return {
      loader: 'postcss-loader',
      options: { postcssOptions: { sourceMap: false, config: root('postcss.config.js') } },
    };
  }

  function extractCssLoader() {
    return {
      loader: ExtractCssPlugin.loader,
      // FIXME auto?
      options: {
        publicPath: '',
      },
    };
  }

  function stylusLoader() {
    return {
      loader: 'stylus-loader',
      options: {
        stylusOptions: {
          preferPathResolver: 'webpack',
          use: [require('rupture')()],
          import: ['~vj/common/common.inc.styl'],
        },
      },
    };
  }

  const config: import('webpack').Configuration = {
    // bail: !env.production,
    mode: (env.production || env.measure) ? 'production' : 'development',
    profile: env.measure,
    context: root(),
    stats: {
      preset: 'errors-warnings',
    },
    // sentry requires source-map while keep it simple in dev mode
    devtool: env.production ? 'source-map' : false,
    entry: {
      [`hydro-${version}`]: './entry.js',
      'default.theme': './theme/default.js',
      'service-worker': './service-worker.ts',
    },
    cache: {
      type: 'filesystem',
      cacheDirectory: root('../../.cache'),
      idleTimeout: 30000,
      buildDependencies: {
        config: [__filename],
      },
    },
    output: {
      path: root('public'),
      publicPath: '/', // overwrite in entry.js
      workerPublicPath: '/',
      hashFunction: 'sha1',
      hashDigest: 'hex',
      hashDigestLength: 10,
      filename: '[name].js?[contenthash:6]',
      chunkFilename: '[name].[chunkhash:6].chunk.js',
    },
    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
      alias: {
        vj: root(),
      },
      fallback: {
        url: require.resolve('url/'),
        util: require.resolve('util/'),
      },
    },
    module: {
      rules: [
        {
          test: /\.svg$/i,
          oneOf: [
            {
              issuer: /\.[jt]sx?$/,
              resourceQuery: /react/,
              use: { loader: '@svgr/webpack', options: { icon: true } },
            },
            {
              type: 'asset/resource',
            },
          ],
        },
        {
          resourceQuery: /inline/,
          type: 'asset/inline',
        },
        {
          test: /\.(ttf|eot|woff|woff2|png|jpg|jpeg|gif)$/,
          type: 'asset/resource',
          generator: {
            filename: (pathData) => {
              const p = pathData.module.resource.replace(/\\/g, '/');
              const filename = p.split('/').pop();
              if (p.includes('node_modules')) {
                const extra = p.split('node_modules/').pop();
                const moduleName = extra.split('/')[0];
                if (extra.includes('@fontsource')) {
                  return `fonts/${filename}?[hash:6]`;
                }
                if (['katex', 'monaco-editor'].includes(moduleName)) {
                  return `modules/${moduleName}/${filename}?[hash:6]`;
                }
                return `modules/${extra.substr(1)}?[hash:6]`;
              }
              if (p.includes('.iconfont')) return `${filename}?[hash:6]`;
              return `${p.split('ui-default')[1].substring(1)}?[hash:6]`;
            },
          },
        },
        {
          test: /\.m?(jsx|tsx|ts)?$/,
          type: 'javascript/auto',
          use: [{
            loader: 'ts-loader',
            options: {
              transpileOnly: true,
            },
          }],
        },
        {
          test: /\.styl$/,
          use: [extractCssLoader(), cssLoader(), postcssLoader(), stylusLoader()],
        },
        {
          test: /\.css$/,
          use: [extractCssLoader(), cssLoader(), postcssLoader()],
        },
      ],
    },
    experiments: {
      asyncWebAssembly: true,
      syncWebAssembly: true,
    },
    optimization: {
      splitChunks: {
        chunks: 'async',
        minSize: 256000,
        maxAsyncRequests: 5,
        maxInitialRequests: 3,
        automaticNameDelimiter: '-',
        cacheGroups: {
          style: {
            priority: 99,
            name: 'theme',
            type: 'css/mini-extract',
            chunks: 'all',
            enforce: true,
          },
          vendors: {
            test: /[\\/]node_modules[\\/].+\.([jt]sx?|json|yaml|txt|mp3|md)$/,
            priority: -10,
            name(module) {
              const packageName = module.context.replace(/\\/g, '/').split('node_modules/').pop().split('/')[0];
              if (packageName.startsWith('@codingame')) {
                const subName = module.context.replace(/\\/g, '/').split('node_modules/').pop().split('/')[1];
                if (subName.startsWith('monaco-vscode-language-pack-')) {
                  return `i.${subName.split('pack-').pop()}`;
                }
              }
              return `n.${packageName.replace('@', '')}`;
            },
            reuseExistingChunk: true,
          },
          default: {
            priority: -20,
            reuseExistingChunk: true,
          },
        },
      },
      usedExports: true,
      minimizer: [new EsbuildPlugin({
        css: true,
        minify: true,
        minifySyntax: true,
        minifyWhitespace: true,
        minifyIdentifiers: true,
        treeShaking: true,
        target: [
          'chrome65',
        ],
        exclude: [/mathmaps/, /\.min\.js$/],
      })],
      moduleIds: env.production ? 'deterministic' : 'named',
      chunkIds: env.production ? 'deterministic' : 'named',
    },
    plugins: [
      new CleanWebpackPlugin(),
      new WebpackBar(),
      new webpack.ProvidePlugin({
        $: 'jquery',
        jQuery: 'jquery',
        'window.jQuery': 'jquery',
        React: 'react',
      }),
      new ExtractCssPlugin({
        filename: '[name].css?[fullhash:6]',
      }),
      new WebpackManifestPlugin({}),
      new webpack.IgnorePlugin({ resourceRegExp: /(^\.\/locale$)/ }),
      new CopyWebpackPlugin({
        patterns: [
          { from: root('static') },
          { from: root('components/navigation/nav-logo-small_dark.png'), to: 'components/navigation/nav-logo-small_dark.png' },
          { from: root(`${dirname(require.resolve('streamsaver/package.json'))}/mitm.html`), to: 'streamsaver/mitm.html' },
          { from: root(`${dirname(require.resolve('streamsaver/package.json'))}/sw.js`), to: 'streamsaver/sw.js' },
          { from: root(`${dirname(require.resolve('graphiql/package.json'))}/graphiql.min.css`), to: 'graphiql.min.css' },
          { from: `${dirname(require.resolve('monaco-themes/package.json'))}/themes`, to: 'monaco/themes/' },
        ],
      }),
      sentryWebpackPlugin({
        authToken: process.env.SENTRY_AUTH_TOKEN,
        org: 'hydro-dev',
        project: 'hydro-web',
        url: 'https://sentry.hydro.ac',
        sourcemaps: {
          rewriteSources: (source) => source.replace('@hydrooj/ui-default/../../node_modules/', ''),
        },
        release: (process.env.CI && isNew) ? {
          name: `hydro-web@${version}`,
          uploadLegacySourcemaps: root('public'),
        } : {},
      }),
      new webpack.DefinePlugin({
        'process.env.VERSION': JSON.stringify(require('@hydrooj/ui-default/package.json').version),
      }),
      new webpack.optimize.MinChunkSizePlugin({
        minChunkSize: 128000,
      }),
      new webpack.NormalModuleReplacementPlugin(/^node:/, (r) => { r.request = r.request.replace(/^node:/, ''); }),
      new webpack.NormalModuleReplacementPlugin(/^prettier[$/]/, root('../../modules/nop.ts')),
      new webpack.NormalModuleReplacementPlugin(
        /@codingame\/monaco-vscode-(css|fsharp|html|groovy|scss|xml)-default-extension/,
        root('../../modules/nop.ts'),
      ),
      new webpack.NormalModuleReplacementPlugin(/core-js\/stable/, root('__core-js.js')),
      ...env.measure ? [
        new BundleAnalyzerPlugin({ analyzerPort: 'auto' }),
        new DuplicatesPlugin(),
      ] : [],
    ],
  };

  return config;
}
