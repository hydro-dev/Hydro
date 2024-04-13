import { ObjectId } from 'mongodb';
import {
    db, Err, GDoc, HydroGlobal, NotFoundError,
} from 'hydrooj';

declare module 'hydrooj' {
    interface GDoc {
        parent?: ObjectId,
        children?: ObjectId[],
    }
    interface HydroGlobal {
        GroupModel: typeof GroupModel,
    }
}

export const GroupNotFoundError = Err('GroupNotFoundError', NotFoundError);

export class GroupModel {
    static coll = db.collection('user.group');
    static async add(domainId: string, name: string, parent?: ObjectId) {
        // add a group, if parent set, will automatically change its parent
        const gdoc: GDoc = {
            _id: new ObjectId(),
            domainId,
            name,
            uids: [],
            parent,
        };
        if (parent) {
            await this.coll.updateOne({ _id: parent }, { $push: { children: gdoc._id } });
        }
        return await this.coll.insertOne(gdoc);
    }

    static async del(domainId: string, name: string) {
        const gdoc = await this.coll.findOne({ domainId, name });
        if (!gdoc) throw new GroupNotFoundError();
        for (const child of gdoc.children) {
            // eslint-disable-next-line no-await-in-loop
            await this.coll.updateOne({ _id: child }, { $unset: { parent: 1 } });
        }
        return await this.coll.deleteOne({ domainId, name });
    }

    static async has(domainId: string, uid: number, name: string) {
        // check if a user has a group
        let gdoc = await this.coll.findOne({ domainId, name });
        if (!gdoc) throw new GroupNotFoundError();
        while (!gdoc.uids.includes(uid) && gdoc.parent) {
            // eslint-disable-next-line no-await-in-loop
            gdoc = await this.coll.findOne({ _id: gdoc.parent });
        }
        return gdoc.uids.includes(uid);
    }

    static async get(domainId: string, name: string) {
        return await this.coll.findOne({ domainId, name });
    }
}

export function apply() {
    (global.Hydro as HydroGlobal).GroupModel = GroupModel;
}
