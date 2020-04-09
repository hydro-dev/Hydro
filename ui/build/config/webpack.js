/* eslint-disable */
import _ from 'lodash';

import webpack from 'webpack';
import fs from 'fs-extra';

import MonacoWebpackPlugin from 'monaco-editor-webpack-plugin';
import FriendlyErrorsPlugin from 'friendly-errors-webpack-plugin';
import OptimizeCssAssetsPlugin from 'optimize-css-assets-webpack-plugin';
import ExtractTextPlugin from 'extract-text-webpack-plugin';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import UglifyJsPlugin from 'uglifyjs-webpack-plugin';
import StaticManifestPlugin from '../plugins/webpackStaticManifestPlugin.js';
import DummyOutputPlugin from '../plugins/webpackDummyOutputPlugin.js';
import mapWebpackUrlPrefix from '../utils/mapWebpackUrlPrefix.js';
import root from '../utils/root.js';

const extractProjectCSS = new ExtractTextPlugin({ filename: 'vj4.css?[sha1:contenthash:hex:10]', allChunks: true });
const extractVendorCSS = new ExtractTextPlugin({ filename: 'vendors.css?[sha1:contenthash:hex:10]', allChunks: true });

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
        ...require(root('package.json')).babelForProject,
        cacheDirectory,
      },
    };
  }

  function jsonLoader() {
    return 'json-loader';
  }

  function postcssLoader() {
    return {
      loader: 'postcss-loader',
      options: {
        sourceMap: env.production,
      },
    };
  }

  function styleLoader() {
    return 'style-loader';
  }

  function cssLoader() {
    return 'css-loader?importLoaders=1';
  }

  function stylusLoader() {
    return 'stylus-loader';
  }

  function fileLoader() {
    return {
      loader: 'file-loader',
      options: {
        name: '[path][name].[ext]?[sha1:hash:hex:10]',
      },
    };
  }

  const config = {
    bail: true,
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
          exclude: /node_modules[\/\\]/,
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
          exclude: /node_modules[\/\\]/,
          use: [babelLoader()],
        },
        {
          test: /\.json$/,
          use: [jsonLoader()],
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
          // project stylus stylesheets
          test: /\.styl$/,
          use: env.watch
            ? [styleLoader(), cssLoader(), postcssLoader(), stylusLoader()]
            : extractProjectCSS.extract([cssLoader(), postcssLoader(), stylusLoader()])
          ,
        },
        {
          // vendors stylesheets
          test: /\.css$/,
          include: /node_modules[\/\\]/,
          use: env.watch
            ? [styleLoader(), cssLoader()]
            : extractVendorCSS.extract([cssLoader()])
          ,
        },
        {
          // project stylesheets
          test: /\.css$/,
          exclude: /node_modules[\/\\]/,
          use: env.watch
            ? [styleLoader(), cssLoader(), postcssLoader()]
            : extractProjectCSS.extract([cssLoader(), postcssLoader()])
          ,
        },
      ],
    },
    plugins: [

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

      new MonacoWebpackPlugin({
        // available options are documented at https://github.com/Microsoft/monaco-editor-webpack-plugin#options
        languages: ['cpp', 'csharp', 'java', 'javascript', 'python', 'rust', 'ruby', 'php', 'pascal', 'go']
      }),

      // extract stylesheets into a standalone file
      env.watch
        ? new DummyOutputPlugin('vendors.css')
        : extractVendorCSS,

      env.watch
        ? new DummyOutputPlugin('vj4.css')
        : extractProjectCSS,

      // extract 3rd-party JavaScript libraries into a standalone file
      env.watch
        ? new DummyOutputPlugin('vendors.js')
        : new webpack.optimize.CommonsChunkPlugin({
          name: 'vendors',
          minChunks: (module, count) => (
            module.resource
                        && module.resource.indexOf(root('node_modules'))
                        && module.resource.match(/\.jsx?$/)
          ),
        }),

      // extract manifest into a standalone file
      env.watch
        ? new DummyOutputPlugin('manifest.js')
        : new webpack.optimize.CommonsChunkPlugin({
          name: 'manifest',
        }),

      new webpack.optimize.CommonsChunkPlugin({
        children: true,
        async: true,
        minChunks: 2,
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
              require('rupture')(),
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
        ? new UglifyJsPlugin({ sourceMap: true })
        : function () { },
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

          // Beautify the output path of assets
          customInterpolateName: (url, name, options) => beautifyOutputUrl(url),
        },
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
