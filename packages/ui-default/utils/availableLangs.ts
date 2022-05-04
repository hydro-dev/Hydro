const prefixes = new Set(Object.keys(LANGS).filter((i) => i.includes('.')).map((i) => i.split('.')[0]));

export default function getAvailableLangs(langsList?: string[]) {
  const Langs = {};
  for (const key in LANGS) {
    if (prefixes.has(key)) continue;
    if (langsList && langsList.length && langsList.join('') && !langsList.includes(key)) continue;
    else if (LANGS[key].hidden) continue;
    Langs[key] = LANGS[key];
  }
  return Langs;
}
