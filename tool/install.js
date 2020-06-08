const zlib = require('zlib');
const fs = require('fs');

async function install() {
    if (!global.Hydro) throw new Error('Data missing');
    if (!fs.existsSync('hydro')) fs.mkdirSync('hydro');
    const hydro = JSON.parse(zlib.gunzipSync(global.Hydro).toString());
    fs.writeFileSync('development.js', hydro.app);
    for (const i in hydro.modules) {
        fs.writeFileSync(`${i}.hydro`, Buffer.from(hydro.modules[i], 'base64'));
    }
}

install().catch((e) => {
    console.error(e);
    process.exit(1);
});
