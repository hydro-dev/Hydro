import nodejieba from 'nodejieba';
import { Pdoc } from 'hydrooj';
import * as document from 'hydrooj/dist/model/document';
import * as bus from 'hydrooj/dist/service/bus';

declare module 'hydrooj' {
    interface Pdoc {
        search?: string
    }
}

bus.on('document/add', async (doc) => {
    if (doc.type !== document.TYPE_PROBLEM) return;
    const pdoc = doc as Pdoc;
    const segments = nodejieba.cutForSearch(pdoc.title);
    pdoc.search = segments.join(' ');
});

bus.on('document/set', async (domainId, docType, docId, $set) => {
    if (docType !== document.TYPE_PROBLEM || !$set.title) return;
    const segments = nodejieba.cutForSearch($set.title);
    $set.search = segments.join(' ');
});
