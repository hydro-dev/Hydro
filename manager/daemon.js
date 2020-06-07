const fs = require('fs');
const path = require('path');
const child = require('child_process');

const appPath = path.resolve(__dirname, '..', 'hydro', 'development.js');

const app = child.fork(appPath);
