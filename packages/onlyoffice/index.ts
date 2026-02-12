import { randomBytes } from 'crypto';
import { sign } from 'jsonwebtoken';
import { } from '@hydrooj/ui-default/backendlib/markdown-it-media';
import {
    Context, Handler, PRIV, Schema, superagent, SystemModel, UiContextBase, ValidationError,
} from 'hydrooj';

declare module 'hydrooj' {
    interface UiContextBase {
        onlyofficeApi?: string;
    }
}

class OnlyofficeJWTHandler extends Handler {
    notUsage = true;

    private isUrlAllowed(url: URL) {
        const allowedHosts = SystemModel.get('onlyoffice.allowedHosts') || [];
        const serverUrl = SystemModel.get('server.url');
        const candidates = allowedHosts.length ? allowedHosts.slice() : [];
        if (!allowedHosts.length) {
            if (serverUrl) {
                try {
                    candidates.push(new URL(serverUrl).host);
                } catch (e) { }
            }
            if (this.request.host) candidates.push(this.request.host);
            if (this.request.hostname) candidates.push(this.request.hostname);
        }
        const host = url.host.toLowerCase();
        const hostname = url.hostname.toLowerCase();
        return candidates.some((entry) => {
            const normalized = `${entry}`.toLowerCase().trim();
            if (!normalized) return false;
            const suffix = normalized.startsWith('*.') ? normalized.slice(2) : normalized.startsWith('.') ? normalized.slice(1) : '';
            if (suffix) return hostname === suffix || hostname.endsWith(`.${suffix}`);
            if (normalized.includes(':')) return host === normalized;
            return hostname === normalized;
        });
    }

    async get({ url }) {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
        const jwtSecret = SystemModel.get('onlyoffice.jwtsecret');
        if (!jwtSecret || jwtSecret === 'secret') throw new ValidationError('onlyoffice.jwtsecret');
        let parsedUrl: URL;
        try {
            parsedUrl = new URL(url);
        } catch (e) {
            throw new ValidationError('url');
        }
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new ValidationError('url');
        if (!this.isUrlAllowed(parsedUrl)) throw new ValidationError('url');
        if (SystemModel.get('onlyoffice.externalSign')) {
            const res = await superagent.get(SystemModel.get('onlyoffice.externalSign')).query({ url });
            this.response.body = res.body;
            return;
        }
        const path = parsedUrl.pathname;
        const allowDownload = !!SystemModel.get('onlyoffice.allowDownload');
        const payload = {
            document: {
                fileType: path.split('.').pop(),
                key: randomBytes(16).toString('hex'),
                title: decodeURIComponent(path.split('/').pop()),
                url,
                permissions: {
                    comment: false,
                    copy: allowDownload,
                    download: allowDownload,
                    edit: false,
                    fillForms: false,
                    modifyContentControl: false,
                    modifyFilter: false,
                    print: allowDownload,
                    protect: false,
                    review: false,
                },
            },
            editorConfig: {
                lang: this.user.viewLang?.includes('_') ? this.user.viewLang.split('_')[0] : this.user.viewLang || 'zh',
                mode: 'view',
                user: {
                    group: 'Hydro',
                    id: this.user._id.toString(),
                    name: this.user.uname,
                },
                customization: {
                    chat: false,
                    comments: false,
                    help: false,
                    hideRulers: true,
                    plugins: false,
                },
            },
        };
        const token = sign(payload, jwtSecret);
        this.response.body = {
            ...payload,
            token,
        };
    }
}

export function apply(ctx: Context) {
    ctx.inject(['i18n'], (c) => {
        c.i18n.load('en', {
            'onlyoffice.not_configured': 'Onlyoffice API not configured.',
            'onlyoffice.initialize_fail': 'Failed to initialize onlyoffice: {0}',
        });
        c.i18n.load('zh', {
            'onlyoffice.not_configured': 'Onlyoffice 未配置。自行安装 onlyoffice 软件或是使用外部提供的 API。',
            'onlyoffice.initialize_fail': '初始化 onlyoffice 失败: {0}',
        });
    });

    ctx.Route('onlyoffice-jwt', '/onlyoffice-jwt', OnlyofficeJWTHandler);
    if (SystemModel.get('onlyoffice.pdf')) {
        ctx.provideModule('richmedia', 'pdf', {
            get(service, src, md) {
                return `<div data-${service}>${md.utils.escapeHtml(src)}</div>`;
            },
        });
    }
    ctx.setting.SystemSetting(Schema.object({
        onlyoffice: Schema.object({
            api: Schema.string().description('OnlyOffice API URL').role('url').default('https://documentserver/web-apps/apps/api/documents/api.js'),
            jwtsecret: Schema.string().description('JWT Secret').default('secret'),
            allowedHosts: Schema.array(Schema.string()).description('Allowed document hosts').default([]),
            pdf: Schema.boolean().description('Handle pdf documents').default(false),
            externalSign: Schema.string().description('External Sign URL').default(''),
        }),
    }));
    Object.defineProperty(UiContextBase, 'onlyofficeApi', {
        configurable: true,
        enumerable: true,
        get() {
            return SystemModel.get('onlyoffice.api');
        },
    });
    return () => {
        Object.defineProperty(UiContextBase, 'onlyofficeApi', {
            enumerable: false,
        });
    };
}
