import { Context, UserModel } from 'hydrooj';

export async function apply(ctx: Context) {
    // Auto authorize user 2 as super admin
    ctx.on('handler/after/UserRegisterWithCode#post', async (that) => {
        if (that.session.uid === 2) await UserModel.setSuperAdmin(2);
    });
}
