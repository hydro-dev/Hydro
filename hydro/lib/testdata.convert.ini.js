const yaml = require('js-yaml');

function convert(ini) {
    const f = ini.split('\n');
    const count = f[0];
    const res = { cases: [] };
    for (let i = 1; i <= count; i++) {
        const [input, output, time, score, memory] = f[i].split('|');
        const cur = { input, output, score };
        if (parseInt(time) !== 1) cur.time = `${time}s`;
        if (!Number.isNaN(parseInt(memory))) cur.memory = parseInt(memory) / 1024;
        res.cases.push(cur);
    }
    return yaml.safeDump(res);
}

global.Hydro.lib['testdata.convert.ini'] = module.exports = convert;
