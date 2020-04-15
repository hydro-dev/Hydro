const hljs = require('highlight.js');
const MarkdownIt = require('markdown-it');
const katex = require('markdown-it-katex');

class Markdown extends MarkdownIt {
    constructor() {
        super({
            linkify: true,
            highlight(str, lang) {
                if (lang && hljs.getLanguage(lang)) {
                    try {
                        return hljs.highlight(lang, str).value;
                    } catch (__) { } // eslint-disable-line no-empty
                }
                return '';
            },
        });
        this.linkify.tlds('.py', false);
        this.use(katex);
    }
}
module.exports = new Markdown();
