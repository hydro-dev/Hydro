import { Context, Service } from '../context';

const translations: Record<string, Record<string, string>[]> = {};

declare module '../context' {
    interface Context {
        i18n: I18nService;
    }
}
declare module '../service/bus' {
    interface EventMap {
        'app/i18n/update': (lang: string) => void;
    }
}
declare global {
    interface String {
        translate: (...languages: string[]) => string;
    }
}

class I18nService extends Service {
    constructor(ctx: Context) {
        super(ctx, 'i18n', true);
    }

    load(lang: string, content: Record<string, string>) {
        this.ctx.effect(() => {
            translations[lang] ||= [];
            translations[lang].unshift(content);
            this.ctx.emit('app/i18n/update', lang);
            return () => {
                translations[lang] = translations[lang].filter((i) => i !== content);
            };
        });
    }

    get(key: string, lang: string) {
        if (!translations[lang]) return null;
        for (const t of translations[lang] || []) {
            if (t[key]) return t[key];
        }
        return null;
    }

    translate(str: string, languages: string[]) {
        if (languages[0]?.startsWith('en')) {
            // For most use cases, source text equals to translated text in English.
            // So if it doesn't exist, we should use the original text instead of fallback.
            return app.i18n.get(str, languages[0]) || app.i18n.get(str, 'en') || this.toString();
        }
        for (const language of languages.filter(Boolean)) {
            const curr = app.i18n.get(str, language) || app.i18n.get(str, language.split('_')[0])
                || app.i18n.get(str, language.split('-')[0]);
            if (curr) return curr;
        }
        return this.toString();
    }
}

app.provide('i18n', undefined, true);
app.i18n = new I18nService(app);

String.prototype.translate = function translate(...languages: string[]) {
    if (languages[0]?.startsWith('en')) {
        // For most use cases, source text equals to translated text in English.
        // So if it doesn't exist, we should use the original text instead of fallback.
        return app.i18n.get(this, languages[0]) || app.i18n.get(this, 'en') || this.toString();
    }
    for (const language of languages.filter(Boolean)) {
        const curr = app.i18n.get(this, language) || app.i18n.get(this, language.split('_')[0])
            || app.i18n.get(this, language.split('-')[0]);
        if (curr) return curr;
    }
    return this.toString();
};

function collect(lang: string) {
    const s = translations[lang];
    if (!(s instanceof Array)) return {};
    const result = {};
    for (let i = s.length - 1; i >= 0; i--) Object.assign(result, s[i]);
    return result;
}

global.Hydro.locales = new Proxy(translations, {
    get(self, lang: string) {
        if (!self[lang]) return {};
        return new Proxy(self[lang], {
            get(s, key) {
                if (typeof key === 'string') return app.i18n.get(key, lang);
                return Object.assign(collect(lang.split('_')[0]), collect(lang));
            },
            has(s, key: string) {
                return !!s.find((i) => !!i[key]);
            },
        });
    },
}) as any;
