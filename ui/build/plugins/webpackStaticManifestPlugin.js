/* eslint-disable */
const _ = require('lodash');
const crypto = require('crypto');

export default class StaticManifestPlugin {
  constructor({ fileName, ignore }) {
    this.fileName = fileName;
    this.ignore = ignore;
  }

  apply(compiler) {
    compiler.plugin('emit', (compilation, callback) => {
      const stats = compilation.getStats().toJson();
      const manifest = _(stats.assets)
        .map((asset) => {
          const { name } = asset;
          // Skip files listed in ignore
          if (_.some(this.ignore, ignorePattern => name.indexOf(ignorePattern) > -1)) {
            return null;
          }
          // Skip calculating hash for names like ?xxxx
          if (name.indexOf('?') > -1) {
            return [
              name.replace(/\?[\s\S]*/, ''), // origin name
              name, // name with hash
            ];
          }
          // We need to calculate hash for the remaining files.
          const source = compilation.assets[asset.name].source();
          const shasum = crypto.createHash('sha1');
          shasum.update(source);
          const hash = shasum.digest('hex').substr(0, 10);
          return [
            name, // origin name
            `${name}?${hash}`, // name with hash
          ];
        })
        .filter()
        .orderBy(['0'])
        .fromPairs()
        .value();
      const json = JSON.stringify(manifest, null, 2);
      compilation.assets[this.fileName] = {
        source: () => json,
        size: () => json.length,
      };
      callback();
    });
  }
}
