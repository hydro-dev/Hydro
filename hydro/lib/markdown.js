const MarkdownIt = require('markdown-it');
const katex = require('markdown-it-katex');
const Prism = require('prismjs');
const loadLanguages = require('prismjs/components/');

// FIXME doesnt work in webpack
loadLanguages(['js', 'javascript', 'go', 'c', 'pascal', 'hs', 'java', 'cs', 'cpp', 'py', 'ruby']);

class Markdown extends MarkdownIt {
    constructor(safe) {
        super({
            linkify: true,
            highlight(str, lang) {
                if (lang && Prism.languages[lang]) {
                    try {
                        return Prism.highlight(str, Prism.languages[lang], lang);
                    } catch (__) { } // eslint-disable-line no-empty
                }
                return '';
            },
            html: !safe,
        });
        this.linkify.tlds('.py', false);
        this.use(katex);
    }
}
module.exports = {
    unsafe: new Markdown(false),
    safe: new Markdown(true),
};
