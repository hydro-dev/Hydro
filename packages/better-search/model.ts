import nodejieba from 'nodejieba';
import * as bus from 'hydrooj/dist/service/bus';

declare module 'hydrooj' {
    interface Pdoc {
        search?: string
    }
}

const jiebaHook = async (pdoc) => {
    if (!pdoc.title) return;
    const segments = nodejieba.cutForSearch(pdoc.title);
    pdoc.search = segments.join(' ');
};

bus.on('problem/before-add', jiebaHook);
bus.on('problem/before-edit', jiebaHook);
