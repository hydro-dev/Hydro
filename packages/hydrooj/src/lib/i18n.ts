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

export class I18nService extends Service {
    constructor(ctx: Context) {
        super(ctx, 'i18n');
        this.translate = this.translate.bind(this);
        this.load('ja', { __flag: '🇯🇵', __id: 'ja', __langname: '日本語' });
    }

    langs(interfaceOnly = false) {
        const langs: Record<string, string> = {};
        for (const lang in translations) {
            if (interfaceOnly && !translations[lang].find((i) => i.__interface)) continue;
            langs[lang] = this.get('__langname', lang);
        }
        return langs;
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
            return this.get(str, languages[0]) || this.get(str, 'en') || str.toString();
        }
        for (const language of languages.filter(Boolean).map((i) => i.replace(/-/g, '_'))) {
            const curr = this.get(str, language) || this.get(str, language.split('_')[0]);
            if (curr) return curr;
        }
        return str.toString();
    }
}

export const name = 'i18n';

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
