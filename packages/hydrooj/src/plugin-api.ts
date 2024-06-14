import pwsh from './lib/hash.hydro';
import db from './service/db';

export { nanoid } from 'nanoid';

export {
    WebService, Router, HandlerCommon, httpServer,
} from '@hydrooj/framework';

export * from './pipelineUtils';
export * from './error';
export * from './libs';
export * from './settings';
export * as SystemModel from './model/system';
export * as TrainingModel from './model/training';
export * as OpcountModel from './model/opcount';
export * as OplogModel from './model/oplog';
export * as SettingModel from './model/setting';
export * as DiscussionModel from './model/discussion';
export * as DocumentModel from './model/document';
export { DocType } from './model/document';
export * as BuiltinModel from './model/builtin';
export * as ContestModel from './model/contest';
export { default as TokenModel } from './model/token';
export { default as UserModel } from './model/user';
export { default as ProblemModel } from './model/problem';
export { default as RecordModel } from './model/record';
export { default as SolutionModel } from './model/solution';
export { default as MessageModel } from './model/message';
export { default as OauthModel } from './model/oauth';
export { default as BlackListModel } from './model/blacklist';
export { default as DomainModel } from './model/domain';
export { default as StorageModel } from './model/storage';
export { default as TaskModel } from './model/task';
export * from './model/builtin';
export * as JudgeHandler from './handler/judge';
export { registerResolver, registerValue, registerUnion } from './service/api';
export { postJudge } from './handler/judge';
export { Collections } from './service/db';
export { Handler, ConnectionHandler, requireSudo } from './service/server';
export { Service, Context } from './context';
export { buildContent } from './lib/content';
export { default as mime } from './lib/mime';
export { default as rating } from './lib/rating';
export { default as avatar } from './lib/avatar';
/** @deprecated use Handler.paginate instead */
export const paginate = db.paginate.bind(db);
/** @deprecated use db.ranked instead */
export const rank = db.ranked.bind(db);
export { UiContextBase } from './service/layers/base';
export * from '@hydrooj/framework/decorators';
export * from '@hydrooj/framework/validator';
export * as StorageService from './service/storage';
export { EventMap } from './service/bus';
export { db, pwsh };
