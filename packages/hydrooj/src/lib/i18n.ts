const locales = {};

declare global {
    interface String {
        translate: (...languages: string[]) => string;
    }
}

String.prototype.translate = function translate(...languages: string[]) {
    if (languages[0]?.startsWith('en')) {
        // For most use cases, source text equals to translated text in English.
        // So if it doesn't exist, we should use the original text instead of fallback.
        return locales[languages[0]]?.[this] || locales['en']?.[this] || this;
    }
    for (const language of languages) {
        if (!language) continue;
        const curr = (locales[language] || {})[this] || (locales[language.split('_')[0]] || {})[this];
        if (curr) return curr;
    }
    return this;
};

function load(data: Record<string, Record<string, string>>) {
    for (const i in data) {
        if (!locales[i]) locales[i] = { __id: i, ...data[i] };
        else locales[i] = Object.assign(locales[i], data[i]);
    }
}

export = load;

global.Hydro.locales = locales;
global.Hydro.lib.i18n = load;
