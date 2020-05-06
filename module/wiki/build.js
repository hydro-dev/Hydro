const fs = require('fs');
const path = require('path');

const root = (name) => path.resolve(__dirname, name);

exports.prebuild = () => {
    const pages = fs.readdirSync(root('raw'));
    const res = {};
    for (const page of pages) {
        // eslint-disable-next-line import/no-dynamic-require
        const contents = require(root(`raw/${page}/contents.json`));
        res[page] = [];
        for (const id of contents) {
            const content = {};
            const c = fs.readFileSync(root(`raw/${page}/${id}.md`)).toString().split('\n');
            // eslint-disable-next-line prefer-destructuring
            content.title = c[0].split('# ')[1];
            content.id = id;
            content.content = c.splice(1, c.length - 1).join('\n');
            res[page].push(content);
        }
    }
    fs.writeFileSync(root('__build.json'), JSON.stringify(res));
};
