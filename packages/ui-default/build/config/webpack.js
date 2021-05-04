/* eslint-disable import/no-extraneous-dependencies */
import { dirname } from 'path';
import webpack from 'webpack';
import ExtractCssPlugin from 'mini-css-extract-plugin';
import MonacoWebpackPlugin from 'monaco-editor-webpack-plugin';
import FriendlyErrorsPlugin from 'friendly-errors-webpack-plugin';
import OptimizeCssAssetsPlugin from 'optimize-css-assets-webpack-plugin';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer';
import SpeedMeasurePlugin from 'speed-measure-webpack-plugin';
import mapWebpackUrlPrefix from '../utils/mapWebpackUrlPrefix';
import StaticManifestPlugin from '../plugins/manifest.webpack';
import root from '../utils/root';

const beautifyOutputUrl = mapWebpackUrlPrefix([
  { prefix: 'node_modules/katex/dist/', replace: './katex/' },
  { prefix: 'misc/.iconfont', replace: './ui/iconfont' },
]);
const smp = new SpeedMeasurePlugin();

export default function (env = {}) {
  function babelLoader() {
    return {
      loader: 'babel-loader',
      options: {
        ...require(root('babel.config.js')), // eslint-disable-line
        cacheDirectory: true,
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
    mode: env.production ? 'production' : 'development',
    profile: true,
    context: root(),
    entry: {
      hydro: './entry.js',
      'default.theme': './theme/default.js',
      // 'theme.98': './theme/98.js',
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
      extensions: ['.js', '.jsx'],
      alias: { vj: root() },
    },
    module: {
      rules: [
        {
          test: /\.(svg|ttf|eot|woff|woff2|png|jpg|jpeg|gif)$/,
          use: [fileLoader()],
        },
        {
          test: /\.jsx?$/,
          exclude: /node_modules[/\\]/,
          use: [babelLoader()],
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
        minChunks: 2,
      },
    },
    plugins: [
      new webpack.ProgressPlugin(),
      new webpack.ProvidePlugin({
        $: 'jquery',
        jQuery: 'jquery',
        'window.jQuery': 'jquery',
        katex: 'katex/dist/katex.js',
        React: 'react',
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
      ...env.production
        ? [
          new OptimizeCssAssetsPlugin(),
          new webpack.optimize.ModuleConcatenationPlugin(),
          new webpack.LoaderOptionsPlugin({ minimize: true }),
          new webpack.HashedModuleIdsPlugin(),
        ]
        : [new webpack.NamedModulesPlugin()],
      new webpack.LoaderOptionsPlugin({
        options: {
          context: root(),
          customInterpolateName: (url) => beautifyOutputUrl(url),
        },
      }),
      new MonacoWebpackPlugin({
        // available options are documented at https://github.com/Microsoft/monaco-editor-webpack-plugin#options
        languages: ['markdown', 'yaml', 'cpp', 'csharp', 'java', 'javascript', 'python', 'rust', 'ruby', 'php', 'pascal', 'go', 'julia'],
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
