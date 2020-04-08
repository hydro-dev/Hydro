/* eslint-disable */
export default class DummyOutputPlugin {
  constructor(file) {
    this.file = file;
  }

  apply(compiler) {
    compiler.plugin('emit', (compilation, callback) => {
      compilation.assets[this.file] = {
        source: () => '',
        size: () => 0,
      };
      callback();
    });
  }
}
