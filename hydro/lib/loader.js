const fs = require('fs');
const path = require('path');

let installed;
function root(name) {
    return path.resolve(process.cwd(), name);
}
function exist(name) {
    try {
        fs.statSync(root(name));
    } catch (e) {
        return false;
    }
    return true;
}

const superRequire = (name) => {
    let m;
    try {
        m = require(root(name)); // eslint-disable-line import/no-dynamic-require
    } catch (e) {
        m = __non_webpack_require__(root(name)); // eslint-disable-line no-undef
    }
    return m;
};

async function prepare() {
    installed = fs.readdirSync(root('.build/module'));
}

async function handler() {
    for (const i of installed) {
        if (exist(`.build/module/${i}/handler.js`)) {
            superRequire(`.build/module/${i}/handler.js`);
            console.log(`Handler init: ${i}`);
        }
    }
}

async function model() {
    for (const i of installed) {
        if (exist(`.build/module/${i}/model.js`)) {
            superRequire(`.build/module/${i}/model.js`);
            console.log(`Model init: ${i}`);
        }
    }
}

global.Hydro['lib.loader'] = module.exports = { prepare, handler, model };
