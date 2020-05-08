global.Hydro.lib.html2md = module.exports = function html2md(str) {
    return str.replace(/<p>/gmi, '').replace(/<\/p>/gmi, '  ')
        .replace(/<h1>/gmi, '# ')
        .replace(/<h2>/gmi, '## ')
        .replace(/<h3>/gmi, '### ')
        .replace(/<h4>/gmi, '#### ')
        .replace(/<h5>/gmi, '##### ')
        .replace(/<h6>/gmi, '###### ')
        .replace(/<\/?code>/, '\n```\n')
        .replace(/<img.*?src=".*?".*?>.*?<\/img>/gmi, (substr) => {
            const RE_IMG = /<img.*?src="(.*?)".*?>(.*?)<\/img>/i;
            const res = RE_IMG.exec(substr);
            return `[${res[2]}](${res[1]})`;
        })
        .replace(/<\/h[0-6]>/, '\n');
};
