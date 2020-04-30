require('./index.js')('production').catch((e) => {
    console.error(e);
});
