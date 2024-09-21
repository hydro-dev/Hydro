import { sign } from 'jsonwebtoken';
import {
    Context, Handler, SystemModel, UiContextBase,
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
        const path = new URL(url).pathname;
        const payload = {
            document: {
                fileType: path.split('.').pop(),
                key: Math.random().toString(36).substring(2),
                title: decodeURIComponent(path.split('/').pop()),
                url,
                permissions: {
                    comment: false,
                    copy: true,
                    download: true,
                    edit: false,
                    fillForms: false,
                    modifyContentControl: false,
                    modifyFilter: false,
                    print: true,
                    protect: false,
                    review: false,
                },
            },
            editorConfig: {
                lang: this.user.viewLang.includes('_') ? this.user.viewLang.split('_')[0] : this.user.viewLang,
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
    ctx.Route('onlyoffice-jwt', '/onlyoffice-jwt', OnlyofficeJWTHandler);
}
