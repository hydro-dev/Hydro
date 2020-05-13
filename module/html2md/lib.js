const RE_IMG = /<img.*?src="(.*?)".*?>(.*?)<\/img>/i;
const RE_A = /<a.*?href="(.*?)".*?>(.*?)<\/a>/i;
const RE_BLOCKQUOTE = /<blockquote.*?>(.*?)<\/blockquote>/i;

function replacer(RE, cb) { // eslint-disable-line no-unused-vars
    // eslint-disable-next-line no-eval
    return eval(`(substr)=>{
        const s = RE.exec(substr);
        return cb(s);
    }`);
}

function html2md(str) {
    return str.replace(/<p>/gmi, '').replace(/<\/p>/gmi, '  ')
        .replace(/<h[1-6]>/gmi, (substr) => {
            const s = /<h[1-6]>/i.exec(substr);
            return `${'#'.repeat(parseInt(s[1]))} `;
        })
        .replace(/<\/h[0-6]>/, '\n')
        .replace(/<\/?code>/, '\n```\n')
        .replace(/<img.*?src=".*?".*?>.*?<\/img>/gmi, replacer(RE_IMG, (s) => `![${s[2]}](${s[1]})`))
        .replace(/<a.*?href=".*?".*?>.*?<\/a>/gmi, replacer(RE_A, (s) => `[${s[2]}](${s[1]})`))
        .replace(/<blockquote.*?>.*?<\/blockquote>/gmi, replacer(RE_BLOCKQUOTE, (s) => `> ${s[1]}`));
}

global.Hydro.lib.html2md = module.exports = html2md;
