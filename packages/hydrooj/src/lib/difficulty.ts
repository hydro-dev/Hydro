const _CACHE_INFO = {
    s: 0.0,
    y: 0,
    values: [0.0],
};

function _LOGP(x: number) {
    const sqrtPi = 2.506628274631; // Sqrt[Pi]
    return (2 * Math.exp(-2.0 * (Math.log(x) ** 2))) / x / sqrtPi;
}

function _intergrateEnsureCache(y: number) {
    let lastY = _CACHE_INFO.y;
    if (y <= lastY) return _CACHE_INFO;
    let s = _CACHE_INFO.s;
    const dx = 0.1;
    const dT = 2;
    let x0 = (lastY / dT) * dx;
    while (y > lastY) {
        x0 += dx;
        s += _LOGP(x0) * dx;
        for (let i = 1; i <= dT; i++) _CACHE_INFO.values.push(s);
        lastY += dT;
    }
    _CACHE_INFO.y = lastY;
    _CACHE_INFO.s = s;
    return _CACHE_INFO;
}

_intergrateEnsureCache(10000);

function _integrate(y: number) {
    _intergrateEnsureCache(y);
    return _CACHE_INFO.values[y];
}

function difficultyAlgorithm(nSubmit: number, nAccept: number) {
    if (!nSubmit) return null;
    const s = _integrate(nSubmit);
    const acRate = nAccept / nSubmit;
    const ans = Math.round(10 - 13 * s * acRate);
    return Math.max(ans, 1);
}

export default difficultyAlgorithm;
global.Hydro.lib.difficulty = difficultyAlgorithm;
