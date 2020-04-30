const path = require('path');

function root(name) {
    return path.resolve(__dirname, '..', name);
}
module.exports = root;
