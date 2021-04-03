/* eslint-disable camelcase */
import { BadRequestError } from '../error';
import { PRIV } from '../model/builtin';
import user from '../model/user';
import {
    Route, Handler, Types, param,
} from '../service/server';

class CheckInHandler extends Handler {
    async prepare() {
        const { checkincnt, lastcheckin } = this.user;
        const today = new Date();
        today.setHours(0);
        today.setMinutes(0);
        today.setSeconds(0);
        today.setMilliseconds(0);
        if (lastcheckin === today.getTime()) throw new BadRequestError("You've already checked in today!");
        this.user.checkincnt++;
        this.user.lastcheckin = today.getTime();
        await Promise.all([
            user.setById(this.user._id, { checkincnt, lastcheckin }),
            user.inc(this.user._id, 'rpdelta', Math.round(Math.sqrt(checkincnt))),
        ]);
    }

    async get() {
        this.response.redirect = '/';
    }

    async post() {
        this.response.body = {
            cnt: this.user.checkincnt,
            last: this.user.lastcheckin,
        };
    }
}

class SwitchLanguageHandler extends Handler {
    @param('lang', Types.String)
    async get(domainId: string, lang: string) {
        if (this.user.hasPriv(PRIV.PRIV_USER_PROFILE)) {
            this.session.viewLang = lang;
            await user.setById(this.user._id, { viewLang: lang });
        } else this.session.viewLang = lang;
        this.back();
    }
}

export async function apply() {
    Route('check_in', '/checkin', CheckInHandler, PRIV.PRIV_USER_PROFILE);
    Route('switch_language', '/language/:lang', SwitchLanguageHandler);
}

global.Hydro.handler.misc = apply;
