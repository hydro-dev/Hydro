const fs = require('fs');
const { root } = require('./utils');

module.exports = () => {
    const pages = fs.readdirSync(root('wiki'));
    const res = {};
    for (const page of pages) {
        const c = fs.readFileSync(root(`wiki/${page}`)).toString().split('\n');
        const pagename = page.split('.')[0];
        res[pagename] = [];
        let content = null;
        for (let i = 0; i < c.length; i++) {
            const line = c[i];
            if (line.startsWith('# ')) {
                if (content) res[pagename].push(content);
                content = {};
                const t = line.split('# ')[1].split('|');
                [content.title, content.id] = t.map((q) => q.trim());
                content.content = '';
            } else {
                content.content = `${content.content}${line}\n`;
            }
        }
    }
    return res;
};
