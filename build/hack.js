const fs = require('fs');
const path = require('path');

module.exports = {
    formidable: () => {
        const tasks = ['incoming_form', 'file', 'json_parser', 'querystring_parser'];
        for (const task of tasks) {
            const p = require.resolve(`formidable/lib/${task}`);
            const file = fs.readFileSync(p).toString().split('\n');
            if (file[0].includes('if (global.GENTLY) require = GENTLY.hijack(require);')) {
                file[0] = '// Hacked';
                fs.writeFileSync(p, file.join('\n'));
            } else if (!file[0].includes('// Hacked')) {
                console.error('Cannot hack formidable', task);
            }
        }
    },
    sockjs: () => {
        const p = require.resolve('sockjs/lib/sockjs.js');
        const file = fs.readFileSync(p).toString().split('\n');
        if (file[139].includes('this.app.log')) {
            file[139] = '// Hacked';
            fs.writeFileSync(p, file.join('\n'));
        } else if (!file[139].includes('// Hacked')) {
            console.error('Cannot hack sockjs');
        }
    },
    saslprep: () => {
        const q = require.resolve('saslprep');
        const mem = path.join(path.dirname(q), 'code-points.mem');
        const p = path.join(path.dirname(q), 'lib', 'memory-code-points.js');
        const data = fs.readFileSync(mem);
        const file = fs.readFileSync(p).toString().split('\n');
        if (file[7].includes('fs.readFileSync')) {
            file[7] = `const memory = Buffer.from('${data.toString('base64')}', 'base64');`;
            fs.writeFileSync(p, file.join('\n'));
        } else if (!file[7].includes('Buffer.from')) {
            console.error('Cannot hack saslprep');
        }
    },
    ftp: () => {
        const p = require.resolve('ftp/lib/connection');
        const file = fs.readFileSync(p).toString().split('\n');
        if (file[51].includes('new Buffer')) {
            file[51] = file[51].replace('new Buffer', 'Buffer.from');
            fs.writeFileSync(p, file.join('\n'));
        } else if (!file[51].includes('Buffer.from')) {
            console.error('Cannot hack ftp');
        }
    },
};
