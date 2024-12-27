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

export const TYPE_BUYDOAMIN: 120 = 120;
export interface BuydoaminDoc {
  docType: 120;
  docId: ObjectId;
  owner: number;
  title: string;
  content: string; // domainId
  ip: string;
  updateAt: Date;
  nReply: number;
  views: number;
  reply: any[];
  react: Record<string, number>;
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
    title: string,
    content: string,
    ip?: string
  ): Promise<ObjectId> {
    const payload: Partial<BuydoaminDoc> = {
      content,
      owner,
      title,
      ip,
      nReply: 0,
      updateAt: new Date(),
      views: 0,
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

  static inc(
    did: ObjectId,
    key: NumberKeys<BuydoaminDoc>,
    value: number
  ): Promise<BuydoaminDoc | null> {
    return DocumentModel.inc("system", TYPE_BUYDOAMIN, did, key, value);
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

  static async addReply(
    did: ObjectId,
    owner: number,
    content: string,
    ip: string
  ): Promise<ObjectId> {
    const [[, drid]] = await Promise.all([
      DocumentModel.push(
        "system",
        TYPE_BUYDOAMIN,
        did,
        "reply",
        content,
        owner,
        {
          ip,
        }
      ),
      DocumentModel.incAndSet("system", TYPE_BUYDOAMIN, did, "nReply", 1, {
        updateAt: new Date(),
      }),
    ]);
    return drid;
  }

  static setStar(did: ObjectId, uid: number, star: boolean) {
    return DocumentModel.setStatus("system", TYPE_BUYDOAMIN, did, uid, {
      star,
    });
  }

  static getStatus(did: ObjectId, uid: number) {
    return DocumentModel.getStatus("system", TYPE_BUYDOAMIN, did, uid);
  }

  static setStatus(did: ObjectId, uid: number, $set) {
    return DocumentModel.setStatus("system", TYPE_BUYDOAMIN, did, uid, $set);
  }
}

global.Hydro.model.buydomain = BuydomainModel;

class buydomainHandler extends Handler {
  ddoc?: BuydoaminDoc;

  @param("did", Types.ObjectId, true)
  async _prepare(domainId: string, did: ObjectId) {
    if (did) {
      this.ddoc = await BuydomainModel.get(did);
      if (!this.ddoc) throw new DiscussionNotFoundError(domainId, did);
    }
  }
}

class buydomainUserHandler extends buydomainHandler {
  @param("uid", Types.Int)
  @param("page", Types.PositiveInt, true)
  async get(domainId: string, uid: number, page = 1) {
    const [ddocs, dpcount] = await paginate(
      BuydomainModel.getMulti({ owner: uid }),
      page,
      10
    );
    const udoc = await UserModel.getById(domainId, uid);
    this.response.template = "buydomain_main.html";
    this.response.body = {
      ddocs,
      dpcount,
      udoc,
      page,
    };
  }
}

class buydomainDetailHandler extends buydomainHandler {
  @param("did", Types.ObjectId)
  async get(domainId: string, did: ObjectId) {
    const dsdoc = this.user.hasPriv(PRIV.PRIV_USER_PROFILE)
      ? await BuydomainModel.getStatus(did, this.user._id)
      : null;
    const udoc = await UserModel.getById(domainId, this.ddoc!.owner);
    if (!dsdoc?.view) {
      await Promise.all([
        BuydomainModel.inc(did, "views", 1),
        BuydomainModel.setStatus(did, this.user._id, { view: true }),
      ]);
    }
    this.response.template = "buydomain_detail.html";
    this.response.body = {
      ddoc: this.ddoc,
      dsdoc,
      udoc,
    };
  }

  async post() {
    this.checkPriv(PRIV.PRIV_USER_PROFILE);
  }

  @param("did", Types.ObjectId)
  async postStar(domainId: string, did: ObjectId) {
    await BuydomainModel.setStar(did, this.user._id, true);
    this.back({ star: true });
  }

  @param("did", Types.ObjectId)
  async postUnstar(domainId: string, did: ObjectId) {
    await BuydomainModel.setStar(did, this.user._id, false);
    this.back({ star: false });
  }
}

class buydomainEditHandler extends buydomainHandler {
  async get() {
    this.response.template = "buydomain_edit.html";
    this.response.body = { ddoc: this.ddoc };
  }

  @param("title", Types.Title)
  @param("content", Types.Content)
  async postCreate(domainId: string, title: string, content: string) {
    await this.limitRate("add_buydomain", 3600, 60);
    const did = await BuydomainModel.add(
      this.user._id,
      title,
      content,
      this.request.ip
    );
    this.response.body = { did };
    this.response.redirect = this.url("buydomain_detail", {
      uid: this.user._id,
      did,
    });
  }

  @param("did", Types.ObjectId)
  @param("title", Types.Title)
  @param("content", Types.Content)
  async postUpdate(
    domainId: string,
    did: ObjectId,
    title: string,
    content: string
  ) {
    if (!this.user.own(this.ddoc!)) this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    await Promise.all([
      BuydomainModel.edit(did, title, content),
      OplogModel.log(this, "buydomain.edit", this.ddoc),
    ]);
    this.response.body = { did };
    this.response.redirect = this.url("buydomain_detail", {
      uid: this.user._id,
      did,
    });
  }

  @param("did", Types.ObjectId)
  async postDelete(domainId: string, did: ObjectId) {
    if (!this.user.own(this.ddoc!)) this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    await Promise.all([
      BuydomainModel.del(did),
      OplogModel.log(this, "buydomain.delete", this.ddoc),
    ]);
    this.response.redirect = this.url("buydomain_main", {
      uid: this.ddoc!.owner,
    });
  }
}

export async function apply(ctx: Context) {
  ctx.Route("buydomain_main", "/buydomain/:uid", buydomainUserHandler);
  ctx.Route(
    "buydomain_create",
    "/buydomain/:uid/create",
    buydomainEditHandler,
    PRIV.PRIV_USER_PROFILE
  );
  ctx.Route("buydomain_detail", "/buydomain/:uid/:did", buydomainDetailHandler);
  ctx.Route(
    "buydomain_edit",
    "/buydomain/:uid/:did/edit",
    buydomainEditHandler,
    PRIV.PRIV_USER_PROFILE
  );

  ctx.injectUI("Nav", "buydomain_main", { prefix: "buydomain_main" });

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
