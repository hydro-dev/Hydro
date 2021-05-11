/**
 * @param {string} str
 * @param {any} obj
 * @returns {string}
 */
export default function substitute(str, obj) {
  return str.replace(/\{([^{}]+)\}/g, (match, key) => {
    if (obj[key] !== undefined) return obj[key].toString();
    return `{${key}}`;
  });
}

window.Hydro.utils.substitute = substitute;
