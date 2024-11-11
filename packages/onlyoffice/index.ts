import { sign } from 'jsonwebtoken';
import { } from '@hydrooj/ui-default/backendlib/markdown-it-media';
import {
    Context, Handler, superagent, SystemModel, UiContextBase, ValidationError,
} from 'hydrooj';

declare module 'hydrooj' {
    interface UiContextBase {
        onlyofficeApi?: string;
    }
}

class OnlyofficeJWTHandler extends Handler {
    noCheckPermView = true;
    notUsage = true;

    async get({ url }) {
        if (SystemModel.get('onlyoffice.externalSign')) {
            const res = await superagent.get(SystemModel.get('onlyoffice.externalSign')).query({ url });
            this.response.body = res.body;
            return;
        }
        let path: string;
        try {
            path = new URL(url).pathname;
        } catch (e) {
            throw new ValidationError('url');
        }
        const allowDownload = !!SystemModel.get('onlyoffice.allowDownload');
        const payload = {
            document: {
                fileType: path.split('.').pop(),
                key: Math.random().toString(36).substring(2),
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
        const token = sign(payload, SystemModel.get('onlyoffice.jwtsecret'));
        this.response.body = {
            ...payload,
            token,
        };
    }
}

export function apply(ctx: Context) {
    Object.defineProperty(UiContextBase, 'onlyofficeApi', {
        configurable: true,
        enumerable: true,
        get() {
            return SystemModel.get('onlyoffice.api');
        },
    });
    ctx.on('dispose', () => {
        Object.defineProperty(UiContextBase, 'onlyofficeApi', {
            enumerable: false,
        });
    });

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
}
