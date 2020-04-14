/* eslint-disable import/no-extraneous-dependencies */
import yaml from 'js-yaml';

import PluginError from 'plugin-error';
import through from 'through2';
import path from 'path';

export default function generateLocales() {
  function bufferContents(file, encoding, callback) {
    if (file.isNull()) {
      callback();
      return;
    }
    if (file.isStream()) {
      this.emit('error', new PluginError('gulpGenerateLocales', 'Stream not supported'));
      callback();
      return;
    }

    const doc = yaml.safeLoad(file.contents);
    file.contents = Buffer.from(`window.LOCALES = ${JSON.stringify(doc, null, 2)}`);
    file.path = path.join(
      path.dirname(file.path),
      `${path.basename(file.path, path.extname(file.path))}.js`
    );

    this.push(file);
    callback();
  }

  return through.obj(bufferContents);
}
