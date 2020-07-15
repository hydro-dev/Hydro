const fs = require('fs');
const path = require('path');

function fix(file) {
    let content = fs.readFileSync(file).toString();
    content = content.replace(/https:\/\/registry.yarnpkg.com\//gmi, 'https://registry.npm.taobao.org/');
    fs.writeFileSync(file, content);
}

fix(path.resolve(__dirname, '..', 'yarn.lock'));
fix(path.resolve(__dirname, '..', 'ui', 'yarn.lock'));
