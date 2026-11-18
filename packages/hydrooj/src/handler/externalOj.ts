import type { Context } from '../context';
import { PRIV } from '../model/builtin';
import {
    bindExternalOj, describeExternalOjBindings, ExternalOjBindingError, externalPlatform, getExternalOjBindings, unbindExternalOj,
} from '../model/externalOj';
import { Handler, post, Types } from '../service/server';

class HomeExternalOjHandler extends Handler {
    private async renderBindings(feedback?: { platform: string, message: string, input: string }) {
        this.response.template = 'home_external_oj.html';
        this.response.body = {
            accounts: describeExternalOjBindings(await getExternalOjBindings(this.user._id), true),
            feedback,
        };
    }

    async get() {
        await this.renderBindings();
    }

    @post('platform', Types.Name)
    @post('handle', Types.String, true)
    async postBind(_: string, platform: string, handle = '') {
        await this.limitRate('external_oj_binding', 60, 20, '{{user}}');
        try {
            await bindExternalOj(this.user._id, externalPlatform(platform), handle);
        } catch (error) {
            if (!(error instanceof ExternalOjBindingError)) throw error;
            const message = {
                format: ['luogu', 'nowcoder'].includes(platform)
                    ? '请输入数字 UID，或粘贴该平台的公开个人主页链接。'
                    : '请输入该平台的用户名，或粘贴公开个人主页链接。',
                taken: '该外站账号已绑定到另一个 HGNUOJ 用户。同一账号只能入榜一次，请先在原账号解绑。',
                changed: '绑定刚刚被更新，请刷新后再试。',
            }[error.reason];
            this.response.status = error.reason === 'format' ? 400 : 409;
            await this.renderBindings({ platform, message, input: handle.slice(0, 256) });
            return;
        }
        this.response.redirect = this.url('home_external_oj');
    }

    @post('platform', Types.Name)
    async postUnbind(_: string, platform: string) {
        await this.limitRate('external_oj_binding', 60, 20, '{{user}}');
        await unbindExternalOj(this.user._id, externalPlatform(platform));
        this.response.redirect = this.url('home_external_oj');
    }
}

export function apply(ctx: Context) {
    ctx.Route('home_external_oj', '/home/external-oj', HomeExternalOjHandler, PRIV.PRIV_USER_PROFILE);
}
