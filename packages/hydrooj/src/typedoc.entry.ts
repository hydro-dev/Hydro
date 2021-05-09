import * as interfaces from './interface';
import * as document from './model/document';
import user from './model/user';
import domain from './model/domain';
import problem from './model/problem';
import record from './model/record';
import task from './model/task';
import * as training from './model/training';
import blacklist from './model/blacklist';
import * as builtin from './model/builtin';
import oauth from './model/oauth';
import * as oplog from './model/oplog';
import * as system from './model/system';
import * as setting from './model/setting';
import solution from './model/solution';
import token from './model/token';
import message from './model/message';
import * as discussion from './model/discussion';
import * as contest from './model/contest';
import * as opcount from './model/opcount';

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
