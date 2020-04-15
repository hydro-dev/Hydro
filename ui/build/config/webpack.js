/* eslint-disable import/no-extraneous-dependencies */
import webpack from 'webpack';
import fs from 'fs-extra';

import MonacoWebpackPlugin from 'monaco-editor-webpack-plugin';
import FriendlyErrorsPlugin from 'friendly-errors-webpack-plugin';
import OptimizeCssAssetsPlugin from 'optimize-css-assets-webpack-plugin';
import ExtractCssPlugin from 'mini-css-extract-plugin';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import UglifyJsPlugin from 'uglifyjs-webpack-plugin';
import StaticManifestPlugin from '../plugins/webpackStaticManifestPlugin';
import mapWebpackUrlPrefix from '../utils/mapWebpackUrlPrefix';
import root from '../utils/root';

const beautifyOutputUrl = mapWebpackUrlPrefix([
  { prefix: 'node_modules/katex/dist/', replace: 'katex/' },
  { prefix: 'misc/.iconfont', replace: 'ui/iconfont' },
]);

export default function (env = {}) {
  function eslintLoader() {
    return {
      loader: 'eslint-loader',
      options: {
        configFile: root('.eslintrc.js'),
      },
    };
  }

  function babelLoader() {
    let cacheDirectory = root('.cache/babel');
    try {
      fs.ensureDirSync(cacheDirectory);
    } catch (ignored) {
      cacheDirectory = false;
    }
    return {
      loader: 'babel-loader',
      options: {
        ...require(root('package.json')).babelForProject, // eslint-disable-line
        cacheDirectory,
      },
    };
  }

  function cssLoader() {
    return {
      loader: 'css-loader',
      options: {
        importLoaders: 1,
      },
    };
  }

  function postcssLoader() {
    return {
      loader: 'postcss-loader',
      options: {
        sourceMap: env.production,
      },
    };
  }

  function fileLoader() {
    return {
      loader: 'file-loader',
      options: {
        name: '[path][name].[ext]?[sha1:hash:hex:10]',
      },
    };
  }

  function extractCssLoader() {
    return {
      loader: ExtractCssPlugin.loader,
      options: { publicPath: '/' },
    };
  }

  const config = {
    bail: true,
    mode: 'production',
    profile: true,
    context: root(),
    devtool: env.production ? 'source-map' : false,
    entry: {
      vj4: './Entry.js',
    },
    output: {
      path: root('../.uibuild'),
      publicPath: '/', // overwrite in entry.js
      hashFunction: 'sha1',
      hashDigest: 'hex',
      hashDigestLength: 10,
      filename: '[name].js?[chunkhash]',
      chunkFilename: '[name].chunk.js?[chunkhash]',
    },
    resolve: {
      modules: [
        root('node_modules'),
      ],
      alias: {
        vj: root(),
      },
    },
    module: {
      rules: [
        {
          test: /\.jsx?$/,
          exclude: /node_modules[/\\]/,
          enforce: 'pre',
          use: [eslintLoader()],
        },
        {
          // fonts and images
          test: /\.(svg|ttf|eot|woff|woff2|png|jpg|jpeg|gif)$/,
          use: [fileLoader()],
        },
        {
          // ES2015 scripts
          test: /\.js$/,
          exclude: /node_modules[/\\]/,
          use: [babelLoader()],
        },
        {
          // fix pickadate loading
          test: /pickadate/,
          use: [
            {
              loader: 'imports-loader',
              options: { define: '>false' },
            },
          ],
        },
        {
          test: /\.styl$/,
          use: [extractCssLoader(), cssLoader(), postcssLoader(), 'stylus-loader']
          ,
        },
        {
          test: /\.css$/,
          use: [extractCssLoader(), cssLoader(), postcssLoader()]
          ,
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

      new FriendlyErrorsPlugin(),

      // don't include momentjs locale files
      new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/),

      new ExtractCssPlugin({
        filename: 'vj4.css?[contenthash:10]',
        allChunks: true,
      }),

      // copy static assets
      new CopyWebpackPlugin([{ from: root('static') }]),

      // copy emoji images
      new CopyWebpackPlugin([{ from: root('node_modules/emojify.js/dist/images/basic'), to: 'img/emoji/' }]),

      // Options are provided by LoaderOptionsPlugin until webpack#3136 is fixed
      new webpack.LoaderOptionsPlugin({
        test: /\.styl$/,
        stylus: {
          default: {
            preferPathResolver: 'webpack',
            use: [
              require('rupture')(), // eslint-disable-line global-require
            ],
            import: [
              '~vj/common/common.inc.styl',
            ],
          },
        },
      }),

      // Make sure process.env.NODE_ENV === 'production' in production mode
      new webpack.DefinePlugin({
        'process.env': {
          NODE_ENV: env.production ? '"production"' : '"debug"',
        },
      }),

      env.production
        ? new OptimizeCssAssetsPlugin()
        : function () { },
      env.production
        ? new webpack.optimize.ModuleConcatenationPlugin()
        : function () { },
      env.production
        ? new webpack.LoaderOptionsPlugin({ minimize: true })
        : function () { },
      // Replace Module Id with hash or name
      env.production
        ? new webpack.HashedModuleIdsPlugin()
        : new webpack.NamedModulesPlugin(),

      new webpack.LoaderOptionsPlugin({
        options: {
          context: root(),
          customInterpolateName: (url) => beautifyOutputUrl(url),
        },
      }),

      new MonacoWebpackPlugin({
        // available options are documented at https://github.com/Microsoft/monaco-editor-webpack-plugin#options
        languages: ['cpp', 'csharp', 'java', 'javascript', 'python', 'rust', 'ruby', 'php', 'pascal', 'go'],
      }),

      // Finally, output asset hashes
      new StaticManifestPlugin({
        fileName: 'static-manifest.json',
        ignore: [
          'img/emoji/',
          'katex/',
        ],
      }),
    ],
  };

  return config;
}
