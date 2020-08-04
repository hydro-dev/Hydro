import yaml from 'js-yaml';

export default function convert(ini: string) {
    const f = ini.split('\n');
    const count = parseInt(f[0], 10);
    const res = { cases: [] };
    for (let i = 1; i <= count; i++) {
        const [input, output, time, score, memory] = f[i].split('|');
        const cur = {
            input, output, score: parseInt(score, 10), time: `${time}s`, memory: '128m',
        };
        if (!Number.isNaN(parseInt(memory, 10))) cur.memory = `${Math.floor(parseInt(memory, 10) / 1024)}m`;
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

global.Hydro.lib['testdata.convert.ini'] = convert;
