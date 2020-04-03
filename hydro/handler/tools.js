const
    opcount = require('../model/opcount'),
    { PermissionError } = require('../error');

module.exports = {
    requirePerm(perm) {
        return async (ctx, next) => {
            for (let i in arguments) {
                if (arguments[i] instanceof Array) {
                    let p = false;
                    for (let j in arguments)
                        if (ctx.state.user.hasPerm(arguments[i][j])) {
                            p = true;
                            break;
                        }
                    if (!p) throw new PermissionError([arguments[i]]);
                } else {
                    if (ctx.state.user.hasPerm(arguments[i])) continue;
                    else throw new PermissionError([arguments[i]]);
                }
            }
            await next();
        };
    },
    limitRate(op, period_secs, max_operations) {
        return async (ctx, next) => {
            await opcount.inc(op, ctx.request.ip, period_secs, max_operations);
            await next();
        };
    }
};