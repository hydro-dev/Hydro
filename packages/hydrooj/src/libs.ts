import * as Zip from '@zip.js/zip.js';
import _AdmZip from 'adm-zip';
import _ from 'lodash';
import { ObjectId as ObjectID } from 'mongodb';
import Schema from 'schemastery';
import superagent from 'superagent';
import { Context } from './context';
export * from './interface';
export * from './typeutils';
export * from './utils';
export { WebSocket, WebSocketServer } from '@hydrooj/framework';
export { Filter, ObjectId } from 'mongodb';
export {
    _, ObjectID, Schema, superagent, Zip,
};
/** @deprecated Use ZipReader/ZipWriter instead */
export const AdmZip = _AdmZip;
export const definePlugin = <T = never>(args: {
    inject?: keyof Context[] | Record<keyof Context, any>;
    apply: (ctx: Context, config: T) => Promise<void> | void;
    schema?: Schema<T>;
    name?: string;
    Config?: Schema<T>;
}) => args;
