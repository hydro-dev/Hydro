import nunjucks from 'nunjucks';
import through from 'through2';

export default function compile(data, options = {}) {
  return through.obj(function (file, encoding, callback) {
    if (file.isNull()) {
      callback(null, file);
      return;
    }
    const context = { ...data, ...file.data };
    const filePath = file.path;
    const env = options.env || new nunjucks.Environment(new nunjucks.FileSystemLoader(file.base), options);
    if (options.filters && !options.env) {
      for (const key of Object.keys(options.filters)) {
        env.addFilter(key, options.filters[key]);
      }
    }
    try {
      file.contents = Buffer.from(env.renderString(file.contents.toString(), context));
      file.extname = '.styl';
      this.push(file);
    } catch (error) {
      this.emit('error', new Error(`gulp-nunjucks ${error} ${filePath}`));
    }
    callback();
  });
}
