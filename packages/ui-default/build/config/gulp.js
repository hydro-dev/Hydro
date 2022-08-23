/* eslint-disable no-restricted-syntax */
/* eslint-disable guard-for-in */
/* eslint-disable import/no-extraneous-dependencies */
import chalk from 'chalk';
import log from 'fancy-log';
import gulp from 'gulp';
import iconfont from 'gulp-iconfont';
import gulpif from 'gulp-if';
import plumber from 'gulp-plumber';
import svgmin from 'gulp-svgmin';
import _ from 'lodash';
import vinylBuffer from 'vinyl-buffer';
import nunjucks from '../plugins/gulpNunjucks';
import vjTouch from '../plugins/gulpTouch';

let isInWatchMode = false;
export const tasks = {};
const iconTimestamp = 1577836800; // 2020-1-1

function handleWatchChange(name, r = 300) {
  return _.debounce((ev) => {
    log('File %s: %s', chalk.yellow(ev.type), ev.path);
    tasks[name]();
  }, r);
}

function offsetMtimeAtFirstBuild() {
  // Offset the mtime at first build to
  // workaround webpack/watchpack issue #25.
  return gulpif(!isInWatchMode, vjTouch(~~((Date.now() - 30 * 1000) / 1000)));
}

export default function ({ errorHandler }) {
  let iconfontTemplateArgs = null;

  tasks['iconfont:template'] = () => gulp
    .src('misc/icons/template/*.styl')
    .pipe(nunjucks(iconfontTemplateArgs))
    .pipe(gulp.dest('misc/.iconfont'))
    .pipe(offsetMtimeAtFirstBuild());

  tasks.iconfont = () => gulp
    .src('misc/icons/*.svg')
    .pipe(plumber({ errorHandler }))
    .pipe(svgmin())
    .pipe(gulp.dest('misc/icons'))
    .pipe(offsetMtimeAtFirstBuild())
    .pipe(iconfont({
      fontHeight: 1000,
      prependUnicode: false,
      descent: 6.25 / 100 * 1000,
      fontName: 'vj4icon',
      formats: ['svg', 'ttf', 'eot', 'woff', 'woff2'],
      timestamp: iconTimestamp,
    }))
    .on('glyphs', (glyphs, options) => {
      iconfontTemplateArgs = { glyphs, options };
      tasks['iconfont:template']();
    })
    .pipe(gulp.dest('misc/.iconfont'))
    .pipe(vinylBuffer())
    .pipe(offsetMtimeAtFirstBuild());

  tasks.watch = () => {
    isInWatchMode = true;
    gulp.watch('misc/icons/*.svg', handleWatchChange('iconfont'));
  };

  for (const key in tasks) {
    // gulp4 uses function name directly as task name
    Object.defineProperty(tasks[key], 'name', {
      value: key,
      configurable: true,
    });
    tasks[key] = gulp.series(tasks[key]);
  }

  tasks.default = gulp.series(gulp.parallel(tasks.iconfont));

  return tasks;
}
