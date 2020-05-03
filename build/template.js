const fs = require('fs');
const root = require('./root');

function getFiles(folder) {
    const files = [];
    const f = fs.readdirSync(root(folder));
    for (const i of f) {
        if (!i.startsWith('.')) {
            if (fs.statSync(root(`${folder}/${i}`)).isDirectory()) {
                const g = getFiles(`${folder}/${i}`);
                for (const j of g) files.push(`${i}/${j}`);
            } else files.push(i);
        }
    }
    return files;
}

const build = (dir, exclude = []) => {
    const files = getFiles(dir);
    const templates = {};
    for (const i of files) {
        let template = fs.readFileSync(root(`${dir}/${i}`)).toString();
        if (!exclude.includes(i)) {
            template = template
                .trim()
                .replace(/ *\n */gmi, ' ')
                .replace(/, /gmi, ',')
                .replace(/%} {%/gmi, '%}{%')
                .replace(/ %}/gmi, '%}')
                .replace(/{% /gmi, '{%')
                .replace(/> </gmi, '><')
                .replace(/}} </gmi, '}}<')
                .replace(/> {{/gmi, '>{{')
                .replace(/{{ /gmi, '{{')
                .replace(/ }}/gmi, '}}')
                .trim();
        }
        templates[i] = template;
    }
    return templates;
};

module.exports = build;
