import * as interfaces from './interface';
import blacklist from './model/blacklist';
import * as builtin from './model/builtin';
import * as contest from './model/contest';
import * as discussion from './model/discussion';
import * as document from './model/document';
import domain from './model/domain';
import message from './model/message';
import oauth from './model/oauth';
import * as opcount from './model/opcount';
import * as oplog from './model/oplog';
import problem from './model/problem';
import record from './model/record';
import * as setting from './model/setting';
import solution from './model/solution';
import * as system from './model/system';
import task from './model/task';
import token from './model/token';
import * as training from './model/training';
import user from './model/user';

export const Interface = interfaces;

export namespace Model {
    export const User = user;
    export const Document = document;
    export const Domain = domain;
    export const Problem = problem;
    export const Record = record;
    export const Task = task;
    export const Blacklist = blacklist;
    export const Builtin = builtin;
    export const Training = training;
    export const Contest = contest;
    export const System = system;
    export const Setting = setting;
    export const Solution = solution;
    export const Token = token;
    export const Oplog = oplog;
    export const Opcount = opcount;
    export const Oauth = oauth;
    export const Discussion = discussion;
    export const Message = message;
}
