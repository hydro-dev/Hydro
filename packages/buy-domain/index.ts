import {
  _,
  Context,
  DiscussionNotFoundError,
  DocumentModel,
  Filter,
  Handler,
  NumberKeys,
  ObjectId,
  OplogModel,
  paginate,
  param,
  PRIV,
  Types,
  UserModel,
  DomainModel,
} from "hydrooj";
import { requireSudo } from "../hydrooj/src/service/server";

/*
  提供如下功能：
  1. 购买课程列表页面
  2. 购买课程 处理流程

*/

export const TYPE_BUYDOAMIN: 130 = 130;
export interface BuydoaminDoc {
  docType: 130;
  docId: ObjectId;
  owner: number;
  content: string; // domainId
  ip: string;
  buyType: string; // 购买的vip类型
  buyTimeAt: Date;
  expireTimeAt: Date;
}
declare module "hydrooj" {
  interface Model {
    buydomain: typeof BuydomainModel;
  }
  interface DocType {
    [TYPE_BUYDOAMIN]: BuydoaminDoc;
  }
}

export class BuydomainModel {
  static async add(
    owner: number,
    buyType: string,
    content: string,
    ip?: string
  ): Promise<ObjectId> {
    const curretDate = new Date();
    const expireDate = new Date();
    expireDate.setDate(curretDate.getDate() + 365); // 默认一年, todo...

    const payload: Partial<BuydoaminDoc> = {
      content,
      owner,
      buyType,
      ip,
      buyTimeAt: curretDate,
      expireTimeAt: expireDate,
    };
    const res = await DocumentModel.add(
      "system",
      payload.content!,
      payload.owner!,
      TYPE_BUYDOAMIN,
      null,
      null,
      null,
      _.omit(payload, ["domainId", "content", "owner"])
    );
    payload.docId = res;
    return payload.docId;
  }

  static async get(did: ObjectId): Promise<BuydoaminDoc> {
    return await DocumentModel.get("system", TYPE_BUYDOAMIN, did);
  }

  static edit(
    did: ObjectId,
    title: string,
    content: string
  ): Promise<BuydoaminDoc> {
    const payload = { title, content };
    return DocumentModel.set("system", TYPE_BUYDOAMIN, did, payload);
  }

  static del(did: ObjectId): Promise<never> {
    return Promise.all([
      DocumentModel.deleteOne("system", TYPE_BUYDOAMIN, did),
      DocumentModel.deleteMultiStatus("system", TYPE_BUYDOAMIN, { docId: did }),
    ]) as any;
  }

  static count(query: Filter<BuydoaminDoc>) {
    return DocumentModel.count("system", TYPE_BUYDOAMIN, query);
  }

  static getMulti(query: Filter<BuydoaminDoc> = {}) {
    return DocumentModel.getMulti("system", TYPE_BUYDOAMIN, query).sort({
      _id: -1,
    });
  }
}

class BuydomainListHandler extends Handler {
  @param("uid", Types.Int)
  @param("page", Types.PositiveInt, true)
  async get(uid: number, page = 1) {
    const [ddocs, dpcount] = await paginate(
      DomainModel.getMulti({ owner: { $not: { $eq: uid } } }),
      page,
      10
    );
    // 过滤掉已经加入的domain， todo...
    this.response.template = "buydomain_list.html";
    this.response.body = {
      ddocs,
      dpcount,
      page,
    };
  }
}

export async function apply(ctx: Context) {
  ctx.Route("buydomain_list", "/buydomain/list/:uid", BuydomainListHandler);

  ctx.i18n.load("zh", {
    buydomain_detail: "课程详情",
    buydomain_main: "购买课程",
    buydomain_list: "所有课程",
  });
  ctx.i18n.load("en", {
    buydomain_main: "Buy Lession",
    buydomain_detail: "Lessions Detail",
    buydomain_list: "All Lessions",
  });
}

export default BuydomainModel;
global.Hydro.model.buydomain = BuydomainModel;
