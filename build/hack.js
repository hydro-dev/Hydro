const fs = require('fs');

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
    yargs: () => {
        const p = require.resolve('yargs');
        const file = fs.readFileSync(p).toString().split('\n');
        if (file[12].includes('const argv = yargs(processArgs, cwd, require)')) {
            file[12] = 'const argv = yargs(processArgs, cwd)';
            fs.writeFileSync(p, file.join('\n'));
        } else if (!file[12].includes('const argv = yargs(processArgs, cwd)')) {
            console.error('Cannot hack yargs');
        }
    },
};
