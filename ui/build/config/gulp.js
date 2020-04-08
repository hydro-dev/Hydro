/* eslint-disable */
import _ from 'lodash';
import moment from 'moment';
import gulp from 'gulp';
import log from 'fancy-log';
import chalk from 'chalk';
import svgmin from 'gulp-svgmin';
import vinylBuffer from 'vinyl-buffer';
import iconfont from 'gulp-iconfont';
import nunjucks from 'gulp-nunjucks';
import plumber from 'gulp-plumber';
import gulpif from 'gulp-if';
import vjGenerateLocales from '../plugins/gulpGenerateLocales';
import vjTouch from '../plugins/gulpTouch';

let isInWatchMode = false;
export let tasks = {};
const iconTimestamp = moment.utc([2017, 0, 1, 0, 0, 0, 0]).unix();

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

export default function ({ watch, production, errorHandler }) {
  let iconfontTemplateArgs = null;

  tasks['iconfont:template'] = () => gulp
    .src('misc/icons/template/*.styl')
    .pipe(nunjucks.compile(iconfontTemplateArgs))
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

  tasks.locale = () => gulp
    .src('../locales/*.yaml')
    .pipe(plumber({ errorHandler }))
    .pipe(vjGenerateLocales())
    .pipe(gulp.dest('static/locale'))
    .pipe(offsetMtimeAtFirstBuild());

  tasks.watch = () => {
    isInWatchMode = true;
    gulp.watch('misc/icons/*.svg', handleWatchChange('iconfont'));
    gulp.watch('../locales/*.yaml', handleWatchChange('locale'));
  };

  for (const key in tasks) {
    // gulp4 uses function name directly as task name
    Object.defineProperty(tasks[key], 'name', {
      value: key,
      configurable: true,
    });
    tasks[key] = gulp.series(tasks[key]);
  }

  tasks.default = gulp.series(gulp.parallel(tasks.iconfont, tasks.locale));

  return tasks;
}
