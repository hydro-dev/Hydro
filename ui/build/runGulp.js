/* eslint-disable import/no-extraneous-dependencies */
import gulp from 'gulp';
import log from 'fancy-log';
import chalk from 'chalk';
import gulpConfig from './config/gulp';

export default async function () {
  function handleError(err) {
    log(chalk.red('Error: %s'), chalk.reset(err.toString() + err.stack));
    if (err) process.exit(1);
  }
  const gulpTasks = gulpConfig({ production: true, errorHandler: handleError });
  return new Promise((resolve) => {
    const taskList = {};

    gulp.on('start', ({ uid, name }) => {
      log(chalk.blue('Starting task: %s'), chalk.reset(name));
      taskList[uid] = true;
    });
    gulp.on('stop', ({ uid, name }) => {
      log(chalk.green('Finished: %s'), chalk.reset(name));
      taskList[uid] = false;

      if (Object.values(taskList).filter((b) => b).length === 0) {
        resolve();
      }
    });
    gulpTasks.default();
  });
}
