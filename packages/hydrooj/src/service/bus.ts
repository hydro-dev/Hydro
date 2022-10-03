/* eslint-disable no-await-in-loop */
import type {
    Db, FilterQuery, ObjectID, OnlyFieldsOfType,
} from 'mongodb';
import pm2 from '@hydrooj/utils/lib/locate-pm2';
import { Context } from '../context';
import type { ProblemSolutionHandler } from '../handler/problem';
import type { UserRegisterHandler } from '../handler/user';
import type {
    DiscussionDoc, DomainDoc, FileInfo,
    MessageDoc, ProblemDoc, RecordDoc,
    Tdoc, TrainingDoc, User,
} from '../interface';
import type { DocType } from '../model/document';
import type { Handler } from './server';

export type Disposable = () => void;
export type VoidReturn = Promise<any> | any;

/* eslint-disable @typescript-eslint/naming-convention */
export interface EventMap {
    'app/started': () => void
    'app/load/lib': () => VoidReturn
    'app/load/locale': () => VoidReturn
    'app/load/template': () => VoidReturn
    'app/load/script': () => VoidReturn
    'app/load/setting': () => VoidReturn
    'app/load/model': () => VoidReturn
    'app/load/handler': () => VoidReturn
    'app/load/service': () => VoidReturn
    'app/ready': () => VoidReturn
    'app/exit': () => VoidReturn

    'database/connect': (db: Db) => void
    'database/config': () => VoidReturn

    'system/setting': (args: Record<string, any>) => VoidReturn
    'bus/broadcast': (event: keyof EventMap, ...args: any[]) => VoidReturn
    'monitor/update': (type: 'server' | 'judge', $set: any) => VoidReturn
    'api/update': () => void;
    'task/daily': () => void;

    'user/message': (uid: number, mdoc: MessageDoc) => void
    'user/get': (udoc: User) => void
    'user/delcache': (content: string) => void

    'domain/create': (ddoc: DomainDoc) => VoidReturn
    'domain/before-get': (query: FilterQuery<DomainDoc>) => VoidReturn
    'domain/get': (ddoc: DomainDoc) => VoidReturn
    'domain/before-update': (domainId: string, $set: Partial<DomainDoc>) => VoidReturn
    'domain/update': (domainId: string, $set: Partial<DomainDoc>, ddoc: DomainDoc) => VoidReturn
    'domain/delete': (domainId: string) => VoidReturn

    'document/add': (doc: any) => VoidReturn
    'document/set': <T extends keyof DocType>(
        domainId: string, docType: T, docId: DocType[T],
        $set: any, $unset: OnlyFieldsOfType<DocType[T], any, true | '' | 1>
    ) => VoidReturn

    'handler/create': (thisArg: Handler) => VoidReturn
    'handler/init': (thisArg: Handler) => VoidReturn
    'handler/before-prepare/UserRegister': (thisArg: UserRegisterHandler) => VoidReturn
    'handler/before-prepare': (thisArg: Handler) => VoidReturn
    'handler/before/UserRegister': (thisArg: UserRegisterHandler) => VoidReturn
    'handler/before': (thisArg: Handler) => VoidReturn
    'handler/after/UserRegister': (thisArg: UserRegisterHandler) => VoidReturn
    'handler/after': (thisArg: Handler) => VoidReturn
    'handler/finish/UserRegister': (thisArg: UserRegisterHandler) => VoidReturn
    'handler/finish': (thisArg: Handler) => VoidReturn
    'handler/error': (thisArg: Handler, e: Error) => VoidReturn
    'handler/solution/get': (thisArg: ProblemSolutionHandler) => VoidReturn

    'discussion/before-add': (payload: Partial<DiscussionDoc>) => VoidReturn
    'discussion/add': (payload: Partial<DiscussionDoc>) => VoidReturn

    'problem/before-add': (domainId: string, content: string, owner: number, docId: number, doc: Partial<ProblemDoc>) => VoidReturn
    'problem/add': (doc: Partial<ProblemDoc>, docId: number) => VoidReturn
    'problem/before-edit': (doc: Partial<ProblemDoc>) => VoidReturn
    'problem/edit': (doc: ProblemDoc) => VoidReturn
    'problem/before-del': (domainId: string, docId: number) => VoidReturn
    'problem/del': (domainId: string, docId: number) => VoidReturn
    'problem/list': (query: FilterQuery<ProblemDoc>, handler: any) => VoidReturn
    'problem/get': (doc: ProblemDoc, handler: any) => VoidReturn
    'problem/delete': (domainId: string, docId: number) => VoidReturn
    'problem/addTestdata': (domainId: string, docId: number, name: string, payload: Omit<FileInfo, '_id'>) => VoidReturn
    'problem/delTestdata': (domainId: string, docId: number, name: string[]) => VoidReturn
    'problem/addAdditionalFile': (domainId: string, docId: number, name: string, payload: Omit<FileInfo, '_id'>) => VoidReturn
    'problem/delAdditionalFile': (domainId: string, docId: number, name: string[]) => VoidReturn

    'contest/before-add': (payload: Partial<Tdoc>) => VoidReturn
    'contest/add': (payload: Partial<Tdoc>, id: ObjectID) => VoidReturn

    'training/list': (query: FilterQuery<TrainingDoc>, handler: any) => VoidReturn
    'training/get': (tdoc: TrainingDoc, handler: any) => VoidReturn

    'record/change': (rdoc: RecordDoc, $set?: any, $push?: any) => void
    'record/judge': (rdoc: RecordDoc, updated: boolean) => VoidReturn
}
/* eslint-enable @typescript-eslint/naming-convention */

export function apply(ctx: Context) {
    try {
        if (!process.send || !pm2 || process.env.exec_mode !== 'cluster_mode') throw new Error();
        pm2.launchBus((err, bus) => {
            if (err) throw new Error();
            bus.on('hydro:broadcast', (packet) => {
                ctx.parallel(packet.data.event, ...packet.data.payload);
            });
            ctx.on('bus/broadcast', (event, payload) => {
                process.send({ type: 'hydro:broadcast', data: { event, payload } });
            });
            console.debug('Using pm2 event bus');
        });
    } catch (e) {
        ctx.on('bus/broadcast', (event, payload) => ctx.parallel(event, ...payload));
        console.debug('Using mongodb external event bus');
    }
}

export default app;
export const on = (a, b, c?) => app.on(a, b, c);
export const off = (a, b) => app.off(a, b);
export const once = (a, b, c?) => app.once(a, b, c);
export const parallel = (a, ...b) => app.parallel(a, ...b);
export const emit = (a, ...b) => app.parallel(a, ...b);
export const bail = (a, ...b) => app.bail(a, ...b);
// For backward compatibility
export const serial: any = (a, ...b) => app.parallel(a, ...b);
export const broadcast = (a, ...b) => app.broadcast(a, ...b);

global.Hydro.service.bus = app as any;
