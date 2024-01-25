import AdmZip from 'adm-zip';
import _ from 'lodash';
import { ObjectId as ObjectID } from 'mongodb';
import Schema from 'schemastery';
import superagent from 'superagent';
import { Context } from './context';
export { ObjectId, Filter } from 'mongodb';
export { WebSocket, WebSocketServer } from 'ws';
export * from './utils';
export * from './interface';
export * from './typeutils';
export {
    Schema, AdmZip, superagent, _, ObjectID,
};
export const definePlugin = <T = never>(args: {
    using?: keyof Context[];
    apply: (ctx: Context, config: T) => Promise<void> | void;
    schema?: Schema<T>;
    name?: string;
}) => args;
