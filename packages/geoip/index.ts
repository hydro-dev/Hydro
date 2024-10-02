import fs from 'fs';
import { Reader } from 'maxmind';
import { Context, findFileSync, Service } from 'hydrooj';

const buffer = fs.readFileSync(findFileSync('@hydrooj/geoip/GeoLite2-City.mmdb'));
const reader = new Reader(buffer);

export interface Result {
    location?: string,
    continent?: string,
    country?: string,
    city?: string,
    display: string
}

export default class GeoIPService extends Service {
    constructor(ctx: Context) {
        super(ctx, 'geoip', true);
    }

    provider = '<a href="http://www.maxmind.com" target="_blank">MaxMind</a>';
    lookup(ip: string, locale: string): Result {
        const res: any = reader.get(ip);
        if (!res) return { display: 'Unknown address'.translate(locale) };
        const ret: Result = { display: '' };
        if (res.location) ret.location = res.location;
        if (res.continent) ret.continent = res.continent.names[locale] || res.continent.names.en;
        if (res.country || res.registered_country) {
            ret.country = (res.country || res.registered_country).names[locale]
                || (res.country || res.registered_country).names.en;
        }
        if (res.city) ret.city = res.city.names[locale] || res.city.names.en;
        ret.display = `${ret.continent} ${ret.country}${ret.city ? ` ${ret.city}` : ''}`;
        return ret;
    }
}

export async function apply(ctx: Context) {
    ctx.set('geoip', new GeoIPService(ctx));
}
