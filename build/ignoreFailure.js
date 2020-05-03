module.exports = function ignoreFailure(func, ...params) {
    try {
        func(...params);
    } catch (e) { } // eslint-disable-line no-empty
};
