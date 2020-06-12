global.DEBUG = true;
require('./index.js')('development').catch((e) => {
    console.error(e);
});
