import { apply as hustoj } from './scripts/hustoj';
import { apply as syzoj } from './scripts/syzoj';
import { apply as vijos } from './scripts/vijos';

export function apply(ctx) {
    hustoj(ctx);
    vijos(ctx);
    syzoj(ctx);
}
