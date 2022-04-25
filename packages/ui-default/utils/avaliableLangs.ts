const prefixes = new Set(Object.keys(LANGS).filter((i) => i.includes('.')).map((i) => i.split('.')[0]));

export default function getAvaliableLangs(langsList?) {
  const Langs = {};
  for (const key in LANGS) {
    if (prefixes.has(key)) continue;
    if (langsList && !langsList.includes(key)) continue;
    if (LANGS[key].hidden && !langsList?.includes(key)) continue;
    Langs[key] = LANGS[key];
  }
  return Langs;
}
