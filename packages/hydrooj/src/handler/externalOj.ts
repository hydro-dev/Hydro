import type { Context } from '../context';
import { PRIV } from '../model/builtin';
import {
    bindExternalOj, describeExternalOjBindings, ExternalOjBindingError, ExternalOjSyncResult, externalPlatform,
    getExternalOjBindings, syncExternalOjBinding, unbindExternalOj,
} from '../model/externalOj';
import { Handler, post, Types } from '../service/server';

function syncFeedbackMessage(result: ExternalOjSyncResult, forBind: boolean) {
    switch (result.status) {
        case 'unbound': return '请先绑定该外站账号后再刷新。';
        case 'cooldown': return `刷新过于频繁，请在 ${result.retryAfterSec} 秒后再试。`;
        case 'paused': return `外站接口暂时限流，请在 ${result.retryAfterSec} 秒后再试。`;
        case 'budget': return '今日该平台同步请求配额已用完，请明天再试。';
        case 'busy': return '该账号正在同步中，请稍候刷新页面查看。';
        default:
            return forBind
                ? '账号已绑定，但立即同步失败（可能是外站接口暂时不可用或用户名有误），可稍后点击“立即刷新”重试。'
                : '同步失败，可能是外站接口暂时不可用或用户名不存在，请稍后重试。';
    }
}

class HomeExternalOjHandler extends Handler {
    private async renderBindings(feedback?: { platform: string, message: string, input?: string }) {
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
        const extPlatform = externalPlatform(platform);
        try {
            await bindExternalOj(this.user._id, extPlatform, handle);
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
        const syncResult = await syncExternalOjBinding(this.user._id, extPlatform, { cooldownMs: 0 });
        if (syncResult.status !== 'success') {
            await this.renderBindings({
                platform,
                message: syncFeedbackMessage(syncResult, true),
                input: handle.slice(0, 256),
            });
            return;
        }
        this.response.redirect = this.url('home_external_oj');
    }

    @post('platform', Types.Name)
    async postRefresh(_: string, platform: string) {
        await this.limitRate('external_oj_refresh', 60, 5, '{{user}}');
        const extPlatform = externalPlatform(platform);
        const syncResult = await syncExternalOjBinding(this.user._id, extPlatform, { cooldownMs: 60_000 });
        if (syncResult.status !== 'success') {
            if (syncResult.status === 'cooldown' || syncResult.status === 'paused') this.response.status = 429;
            else if (syncResult.status === 'unbound') this.response.status = 400;
            await this.renderBindings({ platform, message: syncFeedbackMessage(syncResult, false) });
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
