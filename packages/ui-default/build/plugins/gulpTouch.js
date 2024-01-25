/* eslint-disable import/no-extraneous-dependencies */
import fs from 'fs-extra';
import PluginError from 'plugin-error';
import through from 'through2';

export default function touch(mtime) {
  async function touchFile(file) {
    const fd = await fs.open(file.path, 'a');
    try {
      await fs.futimes(fd, mtime, mtime);
    } finally {
      await fs.close(fd);
    }
  }

  function processStream(file, encoding, callback) {
    if (file.isNull()) {
      callback();
      return;
    }
    if (file.isStream()) {
      this.emit('error', new PluginError('gulpTouch', 'Stream not supported'));
      callback();
      return;
    }
    touchFile(file)
      .catch((err) => this.emit('error', err))
      .then(() => {
        this.push(file);
        callback();
      });
  }

  return through.obj(processStream);
}
