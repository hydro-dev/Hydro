const yaml = require('js-yaml');

function convert(ini) {
    const f = ini.split('\n');
    const count = f[0];
    const res = { cases: [] };
    for (let i = 1; i <= count; i++) {
        const [input, output, time, score, memory] = f[i].split('|');
        const cur = { input, output, score: parseInt(score) };
        cur.time = `${time}s`;
        if (!Number.isNaN(parseInt(memory))) cur.memory = `${Math.floor(parseInt(memory) / 1024)}m`;
        else cur.memory = '128m';
        res.cases.push(cur);
    }
    if (res.cases.length > 0) {
        const { time, score, memory } = res.cases[0];
        for (let i = 1; i < res.cases.length; i++) {
            if (res.cases[i].time !== time
                || res.cases[i].score !== score
                || res.cases[i].memory !== memory) {
                return yaml.safeDump(res);
            }
        }
    }
    return yaml.safeDump({
        time: res.cases[0].time,
        score: res.cases[0].score,
        memory: res.cases[0].memory,
    });
}

global.Hydro.lib['testdata.convert.ini'] = module.exports = convert;
