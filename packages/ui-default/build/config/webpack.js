/* eslint-disable global-require */
/* eslint-disable import/no-extraneous-dependencies */
import { dirname } from 'path';
import webpack from 'webpack';
import { CleanWebpackPlugin } from 'clean-webpack-plugin';
import { ESBuildMinifyPlugin } from 'esbuild-loader';
import ExtractCssPlugin from 'mini-css-extract-plugin';
import MonacoWebpackPlugin from 'monaco-editor-webpack-plugin';
import FriendlyErrorsPlugin from 'friendly-errors-webpack-plugin';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer';
import SpeedMeasurePlugin from 'speed-measure-webpack-plugin';
import WebpackBar from 'webpackbar';
import mapWebpackUrlPrefix from '../utils/mapWebpackUrlPrefix';
import StaticManifestPlugin from '../plugins/manifest.webpack';
import root from '../utils/root';

const beautifyOutputUrl = mapWebpackUrlPrefix([
  { prefix: 'node_modules/katex/dist/', replace: './katex/' },
  { prefix: 'misc/.iconfont', replace: './ui/iconfont' },
]);
const smp = new SpeedMeasurePlugin();

export default function (env = {}) {
  function esbuildLoader() {
    return {
      loader: 'esbuild-loader',
      options: {
        loader: 'tsx',
        target: 'es2015',
        sourcemap: true,
      },
    };
  }

  function cssLoader() {
    return {
      loader: 'css-loader',
      options: { importLoaders: 1 },
    };
  }

  function postcssLoader() {
    return {
      loader: 'postcss-loader',
      options: { sourceMap: env.production, config: { path: root('postcss.config.js') } },
    };
  }

  function fileLoader() {
    return {
      loader: 'file-loader',
      options: {
        name(resourcePath) {
          if (resourcePath.includes('node_modules')) {
            const extra = resourcePath.split('node_modules')[1];
            return `modules/${extra.substr(1, extra.length - 1).replace(/\\/g, '/')}?[contenthash]`;
          }
          return '[path][name].[ext]?[contenthash]';
        },
      },
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

  const config = {
    bail: true,
    mode: (env.production || env.measure) ? 'production' : 'development',
    profile: true,
    context: root(),
    entry: {
      hydro: './entry.js',
      'default.theme': './theme/default.js',
    },
    output: {
      path: root('public'),
      publicPath: '/', // overwrite in entry.js
      hashFunction: 'sha1',
      hashDigest: 'hex',
      hashDigestLength: 10,
      filename: '[name].js?[hash]',
      chunkFilename: '[name].chunk.js?[hash]',
    },
    resolve: {
      modules: [root('node_modules'), root('../../node_modules')],
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
      alias: {
        vj: root(),
        'js-yaml': root('utils/yamlCompact'),
        'real-js-yaml': require.resolve('js-yaml'),
      },
    },
    module: {
      rules: [
        {
          test: /\.(svg|ttf|eot|woff|woff2|png|jpg|jpeg|gif)$/,
          use: [fileLoader()],
        },
        {
          test: /\.[jt]sx?$/,
          use: [esbuildLoader()],
        },
        {
          test: /\.styl$/,
          use: [extractCssLoader(), cssLoader(), postcssLoader(), 'stylus-loader'],
        },
        {
          test: /\.css$/,
          use: [extractCssLoader(), cssLoader(), postcssLoader()],
        },
        {
          test: /\.wasm$/,
          use: [fileLoader()],
          type: 'javascript/auto',
        },
      ],
    },
    optimization: {
      splitChunks: {
        minSize: 256000,
        maxAsyncRequests: 5,
        maxInitialRequests: 3,
        automaticNameDelimiter: '-',
        cacheGroups: {
          blockly: {
            test: /[\\/]@?blockly[\\/]/,
            priority: 10,
            name: 'blockly',
          },
          monaco: {
            test: /[\\/]monaco-editor[\\/]/,
            priority: 9,
            name: `monaco-${require('monaco-editor/package.json').version}`,
          },
          vditor: {
            test: /[\\/]vditor[\\/]/,
            priority: 8,
            name: `vditor-${require('vditor/package.json').version}`,
          },
          vendors: {
            test: /[\\/]node_modules[\\/]/,
            priority: -10,
            name: 'vendors',
            reuseExistingChunk: true,
          },
          default: {
            priority: -20,
            reuseExistingChunk: true,
          },
        },
      },
      minimizer: [new ESBuildMinifyPlugin({
        css: true,
        minify: true,
        minifySyntax: true,
        minifyWhitespace: true,
        minifyIdentifiers: true,
        treeShaking: true,
        target: [
          'chrome60',
        ],
        exclude: [/mathmaps/, /\.min\.js$/],
      })],
      moduleIds: env.production ? 'size' : 'named',
      chunkIds: env.production ? 'size' : 'named',
    },
    plugins: [
      new CleanWebpackPlugin(),
      new WebpackBar(),
      new webpack.ProvidePlugin({
        $: 'jquery',
        jQuery: 'jquery',
        'window.jQuery': 'jquery',
        katex: 'katex/dist/katex.js',
        React: 'react',
        monaco: 'monaco-editor/esm/vs/editor/editor.api',
      }),
      new ExtractCssPlugin({
        filename: '[name].css?[hash:10]',
      }),
      new webpack.LoaderOptionsPlugin({
        test: /\.styl$/,
        stylus: {
          default: {
            preferPathResolver: 'webpack',
            use: [require('rupture')()], // eslint-disable-line global-require
            import: ['~vj/common/common.inc.styl'],
          },
        },
      }),
      new FriendlyErrorsPlugin(),
      new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/),
      new CopyWebpackPlugin({
        patterns: [
          { from: root('static') },
          { from: root(`${dirname(require.resolve('emojify.js/package.json'))}/dist/images/basic`), to: 'img/emoji/' },
          { from: root(`${dirname(require.resolve('vditor/package.json'))}`), to: 'vditor/' },
        ],
      }),
      new webpack.DefinePlugin({
        'process.env': {
          NODE_ENV: env.production ? '"production"' : '"debug"',
        },
      }),
      new webpack.LoaderOptionsPlugin({
        options: {
          context: root(),
          customInterpolateName: (url) => beautifyOutputUrl(url),
        },
      }),
      new MonacoWebpackPlugin({
        customLanguages: [{
          label: 'yaml',
          entry: require.resolve('@undefined-moe/monaco-yaml/lib/esm/monaco.contribution'),
          worker: {
            id: 'vs/language/yaml/yamlWorker',
            entry: require.resolve('@undefined-moe/monaco-yaml/lib/esm/yaml.worker.js'),
          },
        }],
      }),
      new StaticManifestPlugin({
        fileName: 'static-manifest.json',
        ignore: [
          'img/emoji/',
          'katex/',
        ],
      }),
      ...env.measure ? [new BundleAnalyzerPlugin({ analyzerPort: 'auto' })] : [],
    ],
  };

  return env.measure ? smp.wrap(config) : config;
}
