import graphql from 'graphql';
import UserModel from '../model/user';
import { Handler, Route } from '../service/server';

const schemaStr = `\
type Query {
    user(id: Int, uname: String, mail: String): User
    problem(id: Int): String
}

type User {
    _id: Int!
    uname: String!
    mail: String!
}`;

const schema = graphql.buildSchema(schemaStr);
const root = {
    user: (arg, ctx) => {
        if (arg.id) return UserModel.getById(ctx.domainId, arg.id);
        if (arg.mail) return UserModel.getByEmail(ctx.domainId, arg.mail);
        if (arg.uname) return UserModel.getByUname(ctx.domainId, arg.uname);
        return ctx.user;
    },
    problem: async () => { },
};

class ApiHandler extends Handler {
    async get() {
        const q = decodeURIComponent(this.ctx.request.querystring);
        if (q === 'schema') {
            this.response.body = { schema: schemaStr };
        } else if (q) {
            this.response.type = 'application/json';
            this.response.body = await graphql.graphql(schema, q, root, this);
        } else this.response.template = 'api.html';
    }

    async post() {
        this.response.type = 'application/json';
        this.response.body = await graphql.graphql(schema, this.args.query, root, this, this.args.variables);
    }
}

export function apply() {
    Route('api', '/api', ApiHandler);
}

global.Hydro.handler.api = apply;
