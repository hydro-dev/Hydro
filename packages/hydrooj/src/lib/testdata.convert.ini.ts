import yaml from 'js-yaml';

function convert(ini: string) {
    const f = ini.split('\n');
    const count = parseInt(f[0], 10);
    const res = { subtasks: [] };
    for (let i = 1; i <= count; i++) {
        const [input, output, time, score, memory] = f[i].split('|');
        const cur = {
            cases: [{ input: `input/${input}`, output: `output/${output}` }],
            score: parseInt(score, 10),
            time: `${time}s`,
            memory: '512m',
        };
        if (!Number.isNaN(parseInt(memory, 10))) cur.memory = `${Math.floor(parseInt(memory, 10) / 1024)}m`;
        res.subtasks.push(cur);
    }
    return yaml.dump(res);
}

global.Hydro.lib['testdata.convert.ini'] = convert;
export = convert;
