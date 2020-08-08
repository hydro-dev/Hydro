import { Pdoc } from '../interface';
import * as problem from '../model/problem';

export const description = 'Create a new user';

const _CACHE_INFO = {
    last_s: 0.0,
    last_y: 0,
    values: [0.0],
};

function _LOGP(x: number) {
    const sqrt_2_pi = 2.506628274631000502415765284811; // Sqrt[Pi]
    return (2 * Math.exp(-1.0 * (Math.log(x) ** 2) * 2)) / x / sqrt_2_pi;
}

function _integrate_ensure_cache(y: number) {
    let last_y = _CACHE_INFO.last_y;
    if (y <= last_y) return _CACHE_INFO;
    let s = _CACHE_INFO.last_s;
    const dx = 0.1;
    const dT = 2;
    let x0 = (last_y / dT) * dx;
    while (y > last_y) {
        x0 += dx;
        s += _LOGP(x0) * dx;
        for (let i = 1; i <= dT; i++) _CACHE_INFO.values.push(s);
        last_y += dT;
    }
    _CACHE_INFO.last_y = last_y;
    _CACHE_INFO.last_s = s;
    return _CACHE_INFO;
}

_integrate_ensure_cache(1000000);

function _integrate(y: number) {
    _integrate_ensure_cache(y);
    return _CACHE_INFO.values[y];
}

function difficultyAlgorithm(nSubmit: number, nAccept: number) {
    if (!nSubmit) return null;
    const s = _integrate(nSubmit);
    const ac_rate = nAccept / nSubmit;
    const ans = Math.round(10.0 - 1.30 * s * 10.0 * ac_rate);
    return Math.max(ans, 1);
}

function _get_difficulty(pdoc: Pdoc, calculatedDifficulty: number) {
    const setting = pdoc.difficultySetting;
    if (setting === problem.SETTING_DIFFICULTY_ALGORITHM) return calculatedDifficulty;
    if (setting === problem.SETTING_DIFFICULTY_ADMIN) return pdoc.difficultyAdmin;
    if (setting === problem.SETTING_DIFFICULTY_AVERAGE && pdoc.difficultyAdmin !== null) {
        return Math.round((calculatedDifficulty + pdoc.difficultyAdmin) / 2);
    } return calculatedDifficulty;
}

export async function run({
    domainId, pid,
}) {
    const pdoc = await problem.get(domainId, pid);
    const difficultyAlgo = difficultyAlgorithm(pdoc.nSubmit, pdoc.nAccept);
    const difficulty = _get_difficulty(pdoc, difficultyAlgo);
    return await problem.edit(domainId, pdoc.docId, { difficulty, difficultyAlgo });
}

export const validate = {
    domainId: { $type: 'string' },
    pid: { $type: 'number' },
};

global.Hydro.script.difficulty = { run, description, validate };
