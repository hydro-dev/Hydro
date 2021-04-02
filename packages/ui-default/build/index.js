require('@babel/register')({
    "plugins": ["@babel/plugin-transform-runtime"],
    "presets": [["@babel/preset-env", { "loose": true }]]
});
const main = require('./main.js');
if (!module.parent) main();
