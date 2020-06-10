const fs = require('fs');
const { root } = require('./utils');

module.exports = {
    formidable: () => {
        const tasks = ['incoming_form', 'file', 'json_parser', 'querystring_parser'];
        for (const task of tasks) {
            let file = fs.readFileSync(root(`node_modules/formidable/lib/${task}.js`)).toString();
            if (file.startsWith('if (global.GENTLY) require = GENTLY.hijack(require);')) {
                file = file.split('\n');
                file[0] = '';
                file = file.join('\n');
                fs.writeFileSync(root(`node_modules/formidable/lib/${task}.js`), file);
            }
        }
    },
    sockjs: () => {
        const file = fs.readFileSync(root('node_modules/sockjs/lib/sockjs.js')).toString().split('\n');
        if (file[139].includes('this.app.log')) {
            file[139] = '';
            fs.writeFileSync(root('node_modules/sockjs/lib/sockjs.js'), file.join('\n'));
        }
    },
};
