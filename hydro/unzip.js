const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const yaml = require('js-yaml');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    } else if (!fs.statSync(dir).isDirectory()) {
        fs.unlinkSync(dir);
        fs.mkdirSync(dir);
    }
}

function root(name) {
    return path.resolve(process.cwd(), name);
}

const moduleRoots = [
    root('.build/module'),
    root('module'),
    root(path.resolve(os.homedir(), '.hydro', 'module')),
    root('.'),
];
let moduleRoot;
for (const i of moduleRoots) {
    if (fs.existsSync(i) && fs.statSync(i).isDirectory()) {
        moduleRoot = i;
        break;
    }
}
function exec() {
    const files = fs.readdirSync(moduleRoot);
    const t = ['service', 'lib', 'model', 'handler', 'script'];
    ensureDir(`${os.tmpdir()}/hydro`);
    ensureDir(`${os.tmpdir()}/hydro/tmp`);
    for (const file of files) {
        if (file.endsWith('.hydro')) {
            try {
                const f = fs.readFileSync(root(`${moduleRoot}/${file}`));
                const s = fs.statSync(root(`${moduleRoot}/${file}`));
                const m = yaml.safeLoad(zlib.gunzipSync(f));
                const { id } = m;
                if (m.os) {
                    if (!m.os.includes(os.platform().toLowerCase())) {
                        console.error(`Module load fail: ${id} ${file.split('.')[0]} Unsupported OS`);
                        // eslint-disable-next-line no-continue
                        continue;
                    }
                }
                ensureDir(`${os.tmpdir()}/hydro/tmp/${id}`);
                if (m.locale) {
                    fs.writeFileSync(
                        `${os.tmpdir()}/hydro/tmp/${id}/locale.json`,
                        JSON.stringify(m.locale),
                    );
                }
                if (m.template) {
                    fs.writeFileSync(
                        `${os.tmpdir()}/hydro/tmp/${id}/template.json`,
                        JSON.stringify(m.template),
                    );
                }
                for (const i of t) {
                    if (m[i]) {
                        fs.writeFileSync(
                            `${os.tmpdir()}/hydro/tmp/${id}/${i}.js`,
                            f[i],
                        );
                    }
                }
                if (m.file) {
                    ensureDir(path.resolve(os.tmpdir(), 'hydro', m.id));
                    for (const n in m.file) {
                        if (m.file[n] === null) {
                            ensureDir(path.resolve(os.tmpdir(), 'hydro', m.id, n));
                        } else {
                            const e = path.resolve(os.tmpdir(), 'hydro', m.id, n);
                            fs.writeFileSync(e, Buffer.from(m.file[n], 'base64'), { mode: 755 });
                        }
                    }
                }
                fs.writeFileSync(
                    root(`${os.tmpdir()}/hydro/tmp/${id}/hydro.json`),
                    JSON.stringify({
                        size: s.size,
                        version: m.version,
                        id: m.id,
                        name: m.name,
                        description: m.description,
                    }),
                );
            } catch (e) {
                if (e.code === 'Z_DATA_ERROR') {
                    console.error(`Module Load Fail: ${file} (File Corrupted)`);
                } else console.error(`Module Load Fail: ${file} ${e}`);
            }
        }
    }
}

module.exports = exec;
