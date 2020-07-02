// For pandora

/**
 * @param {import('pandora').ProcfileReconcilerAccessor} pandora
 */
function start(pandora) {
    pandora
        .process('Hydro')
        .scale(1)
        .args(['--pandora'])
        .entry('./hydro/loader.js');
}

module.exports = start;
