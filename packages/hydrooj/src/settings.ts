import { JSONSchema7Definition } from 'json-schema';

type Def = Exclude<JSONSchema7Definition, boolean>;

function port(examples: number[] = []) {
    const res: Def = {
        type: 'integer', minimum: 1, maximum: 65535,
    };
    if (examples.length) {
        res.default = examples[0];
        res.examples = examples;
    }
    return res;
}

export const Schema = {
    string<T extends Def>(title: string, defaultValue: string, extra?: T) {
        return {
            type: 'string' as 'string',
            default: defaultValue,
            title,
            ...extra,
        };
    },
    boolean<T extends Def>(title: string, defaultValue: boolean, extra?: T) {
        return {
            type: 'boolean' as 'boolean',
            default: defaultValue,
            title,
            ...extra,
        };
    },
    integer<T extends Def>(title: string, defaultValue: number, extra?: T) {
        return {
            type: 'integer' as 'integer',
            default: defaultValue,
            title,
            ...extra,
        };
    },
};

const definitions: Record<string, Def> = {
    smtp: {
        type: 'object',
        properties: {
            user: Schema.string('SMTP Username', 'noreply@hydro.ac'),
            from: Schema.string('Mail From', 'Hydro <noreply@hydro.ac>'),
            pass: Schema.string('SMTP Password', '', { writeOnly: true }),
            host: Schema.string('SMTP Server Host', 'smtp.hydro.ac', { pattern: '^[a-zA-Z0-9\\-\\.]+$' }),
            port: Schema.integer('SMTP Server Port', 25, { examples: [25, 465], minimum: 1, maximum: 65535 }),
            secure: Schema.boolean('Use SSL', false),
            verify: Schema.boolean('Verify register email', false),
        },
        additionalProperties: false,
    },
    file: {
        type: 'object',
        properties: {
            endPoint: Schema.string('Storage engine endPoint', 'http://localhost:9000', {
                pattern: '^https?://[a-zA-Z0-9\\-\\.]+/?$',
            }),
            accessKey: Schema.string('Storage engine accessKey', ''),
            secretKey: Schema.string('Storage engine secretKey', '', { writeOnly: true }),
            bucket: Schema.string('Storage engine bucket', 'hydro'),
            region: Schema.string('Storage engine region', 'us-east-1'),
            pathStyle: Schema.boolean('pathStyle endpoint', true),
            endPointForUser: Schema.string('EndPoint for user', '/fs/'),
            endPointForJudge: Schema.string('EndPoint for judge', '/fs/'),
        },
        required: ['endPoint', 'accessKey', 'secretKey'],
        additionalProperties: false,
    },
    server: {
        type: 'object',
        properties: {
            name: Schema.string('Server Name', 'Hydro'),
            url: Schema.string('Self URL', 'https://hydro.ac/', { pattern: '/$' }),
            cdn: Schema.string('CDN prefix', '/', {
                pattern: '/$', examples: ['/', 'https://cdn.hydro.ac/'],
            }),
            port: port([8888, 80, 443]),
            xff: Schema.string('IP Header', '', { examples: ['x-forwarded-for', 'x-real-ip'], pattern: '^[a-z-]+$' }),
            xhost: Schema.string('Host Header', '', { examples: ['x-real-host'], pattern: '^[a-z-]+$' }),
            language: { type: 'string', enum: Object.keys(global.Hydro.locales) },
            upload: Schema.string('Upload size limit', '256m', { pattern: '^[0-9]+[mkg]b?$' }),
            login: Schema.boolean('Enable builtin login', true),
            message: Schema.boolean('Enable message', true),
            blog: Schema.boolean('Enable blog', true),
            checkUpdate: Schema.boolean('Daily update check', true),
        },
        required: ['url', 'port', 'language'],
    },
    limit: {
        type: 'object',
        properties: {
            problem_files_max: { type: 'integer', minimum: 0 },
        },
    },
    session: {
        type: 'object',
        properties: {
            keys: {
                type: 'array', items: { type: 'string' }, default: [String.random(32)], writeOnly: true,
            },
            secure: { type: 'boolean', default: false },
            saved_expire_seconds: { type: 'integer', minimum: 300, default: 3600 * 24 * 30 },
            unsaved_expire_seconds: { type: 'integer', minimum: 60, default: 3600 * 3 },
        },
    },
    user: {
        type: 'object',
        properties: {
            quota: { type: 'integer', minimum: 0 },
        },
    },
};

export const schema: Def = {
    type: 'object',
    definitions,
    properties: {
        smtp: definitions.smtp,
        file: definitions.file,
        server: definitions.server,
        limit: definitions.limit,
        session: definitions.session,
        user: definitions.user,
    },
    additionalProperties: true,
};

export function addDef(key: string, def: Def) {
    definitions[key] = def;
    schema.properties[key] = definitions[key];
}
