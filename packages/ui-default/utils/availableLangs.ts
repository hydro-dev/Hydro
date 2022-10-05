const prefixes = new Set(Object.keys(window.LANGS).filter((i) => i.includes('.')).map((i) => i.split('.')[0]));

export default function getAvailableLangs(langsList?: string[]) {
  const Langs = {};
  for (const key in window.LANGS) {
    if (prefixes.has(key)) continue;
    if (langsList && langsList.length && langsList.join('') && !langsList.includes(key)) continue;
    else if (window.LANGS[key].hidden && !langsList?.includes(key)) continue;
    Langs[key] = window.LANGS[key];
  }
  return Langs;
}
