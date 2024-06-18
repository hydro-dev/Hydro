import { Context, Schema, UserModel } from 'hydrooj';
import { startPerformanceTest } from './performance-test';

export async function apply(ctx: Context) {
    // Auto authorize user 2 as super admin
    ctx.on('handler/after/UserRegisterWithCode#post', async (that) => {
        if (that.session.uid === 2) await UserModel.setSuperAdmin(2);
    });
    ctx.addScript('performance-test', 'test', Schema.object({ enable5: Schema.boolean().default(false) }), startPerformanceTest);
}
