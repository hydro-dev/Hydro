const AdmZip = require('adm-zip');

function build() {
    const zip = new AdmZip();
    zip.addLocalFolder('public', 'public');
    zip.addLocalFolder('locales', 'locales');
    zip.addLocalFolder('templates', 'templates');
    zip.addLocalFolder('wiki', 'wiki');
    zip.addLocalFile('package.json');
    zip.writeZip('.build/builtin.hydro');
}

module.exports = build;
