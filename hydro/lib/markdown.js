const
    hljs = require('highlight.js'),
    MarkdownIt = require('markdown-it'),
    katex = require('markdown-it-katex');

class Markdown extends MarkdownIt {
    constructor() {
        super({
            linkify: true,
            highlight: function (str, lang) {
                if (lang && hljs.getLanguage(lang))
                    try {
                        return hljs.highlight(lang, str).value;
                    } catch (__) { } // eslint-disable-line no-empty
                return '';
            }
        });
        this.linkify.tlds('.py', false);
        this.use(katex);
    }
}
module.exports = new Markdown();
