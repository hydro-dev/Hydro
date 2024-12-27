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
  UI,
} from "hydrooj";

export const TYPE_SMPASTE: 100 = 100;
export interface SmpasteDoc {
  docType: 100;
  docId: ObjectId;
  owner: number;
  title: string;
  content: string;
  ip: string;
  updateAt: Date;
  nReply: number;
  views: number;
  reply: any[];
  react: Record<string, number>;
}
declare module "hydrooj" {
  interface Model {
    smpaste: typeof SmpasteModel;
  }
  interface DocType {
    [TYPE_SMPASTE]: SmpasteDoc;
  }
}

export class SmpasteModel {
  static async add(
    owner: number,
    title: string,
    content: string,
    ip?: string
  ): Promise<ObjectId> {
    const payload: Partial<SmpasteDoc> = {
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
      TYPE_SMPASTE,
      null,
      null,
      null,
      _.omit(payload, ["domainId", "content", "owner"])
    );
    payload.docId = res;
    return payload.docId;
  }

  static async get(did: ObjectId): Promise<SmpasteDoc> {
    return await DocumentModel.get("system", TYPE_SMPASTE, did);
  }

  static edit(
    did: ObjectId,
    title: string,
    content: string
  ): Promise<SmpasteDoc> {
    const payload = { title, content };
    return DocumentModel.set("system", TYPE_SMPASTE, did, payload);
  }

  static inc(
    did: ObjectId,
    key: NumberKeys<SmpasteDoc>,
    value: number
  ): Promise<SmpasteDoc | null> {
    return DocumentModel.inc("system", TYPE_SMPASTE, did, key, value);
  }

  static del(did: ObjectId): Promise<never> {
    return Promise.all([
      DocumentModel.deleteOne("system", TYPE_SMPASTE, did),
      DocumentModel.deleteMultiStatus("system", TYPE_SMPASTE, { docId: did }),
    ]) as any;
  }

  static count(query: Filter<SmpasteDoc>) {
    return DocumentModel.count("system", TYPE_SMPASTE, query);
  }

  static getMulti(query: Filter<SmpasteDoc> = {}) {
    return DocumentModel.getMulti("system", TYPE_SMPASTE, query).sort({
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
      DocumentModel.push("system", TYPE_SMPASTE, did, "reply", content, owner, {
        ip,
      }),
      DocumentModel.incAndSet("system", TYPE_SMPASTE, did, "nReply", 1, {
        updateAt: new Date(),
      }),
    ]);
    return drid;
  }

  static setStar(did: ObjectId, uid: number, star: boolean) {
    return DocumentModel.setStatus("system", TYPE_SMPASTE, did, uid, { star });
  }

  static getStatus(did: ObjectId, uid: number) {
    return DocumentModel.getStatus("system", TYPE_SMPASTE, did, uid);
  }

  static setStatus(did: ObjectId, uid: number, $set) {
    return DocumentModel.setStatus("system", TYPE_SMPASTE, did, uid, $set);
  }
}

global.Hydro.model.smpaste = SmpasteModel;

class smpasteHandler extends Handler {
  ddoc?: SmpasteDoc;

  @param("did", Types.ObjectId, true)
  async _prepare(domainId: string, did: ObjectId) {
    if (did) {
      this.ddoc = await SmpasteModel.get(did);
      if (!this.ddoc) throw new DiscussionNotFoundError(domainId, did);
    }
  }
}

class smpasteUserHandler extends smpasteHandler {
  @param("uid", Types.Int)
  @param("page", Types.PositiveInt, true)
  async get(domainId: string, uid: number, page = 1) {
    const [ddocs, dpcount] = await paginate(
      SmpasteModel.getMulti({ owner: uid }),
      page,
      10
    );
    const udoc = await UserModel.getById(domainId, uid);
    this.response.template = "smpaste_main.html";
    this.response.body = {
      ddocs,
      dpcount,
      udoc,
      page,
    };
  }
}

class smpasteDetailHandler extends smpasteHandler {
  @param("did", Types.ObjectId)
  async get(domainId: string, did: ObjectId) {
    const dsdoc = this.user.hasPriv(PRIV.PRIV_USER_PROFILE)
      ? await SmpasteModel.getStatus(did, this.user._id)
      : null;
    const udoc = await UserModel.getById(domainId, this.ddoc!.owner);
    if (!dsdoc?.view) {
      await Promise.all([
        SmpasteModel.inc(did, "views", 1),
        SmpasteModel.setStatus(did, this.user._id, { view: true }),
      ]);
    }
    this.response.template = "smpaste_detail.html";
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
    await SmpasteModel.setStar(did, this.user._id, true);
    this.back({ star: true });
  }

  @param("did", Types.ObjectId)
  async postUnstar(domainId: string, did: ObjectId) {
    await SmpasteModel.setStar(did, this.user._id, false);
    this.back({ star: false });
  }
}

class smpasteEditHandler extends smpasteHandler {
  async get() {
    this.response.template = "smpaste_edit.html";
    this.response.body = { ddoc: this.ddoc };
  }

  @param("title", Types.Title)
  @param("content", Types.Content)
  async postCreate(domainId: string, title: string, content: string) {
    await this.limitRate("add_smpaste", 3600, 60);
    const did = await SmpasteModel.add(
      this.user._id,
      title,
      content,
      this.request.ip
    );
    this.response.body = { did };
    this.response.redirect = this.url("smpaste_detail", {
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
      SmpasteModel.edit(did, title, content),
      OplogModel.log(this, "smpaste.edit", this.ddoc),
    ]);
    this.response.body = { did };
    this.response.redirect = this.url("smpaste_detail", {
      uid: this.user._id,
      did,
    });
  }

  @param("did", Types.ObjectId)
  async postDelete(domainId: string, did: ObjectId) {
    if (!this.user.own(this.ddoc!)) this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    await Promise.all([
      SmpasteModel.del(did),
      OplogModel.log(this, "smpaste.delete", this.ddoc),
    ]);
    this.response.redirect = this.url("smpaste_main", {
      uid: this.ddoc!.owner,
    });
  }
}

export async function apply(ctx: Context) {
  ctx.Route("smpaste_main", "/smpaste/:uid", smpasteUserHandler);
  ctx.Route(
    "smpaste_create",
    "/smpaste/:uid/create",
    smpasteEditHandler,
    PRIV.PRIV_USER_PROFILE
  );
  ctx.Route("smpaste_detail", "/smpaste/:uid/:did", smpasteDetailHandler);
  ctx.Route(
    "smpaste_edit",
    "/smpaste/:uid/:did/edit",
    smpasteEditHandler,
    PRIV.PRIV_USER_PROFILE
  );
  ctx.injectUI(
    "UserDropdown",
    "smpaste_main",
    (h) => ({
      icon: "copy",
      displayName: "smpaste",
      uid: h.user._id.toString(),
    }),
    PRIV.PRIV_USER_PROFILE
  );

  ctx.i18n.load("zh", {
    "{0}'s smpaste": "{0} 的剪切板1",
    "Create a smpaste": "新建一个剪切板",
    smpaste: "剪切板",
    smpaste_detail: "剪切板详情",
    smpaste_edit: "编辑剪切板",
    smpaste_main: "剪切板",
  });
  ctx.i18n.load("en", {
    smpaste_main: "Paste",
    smpaste_detail: "Paste Detail",
    smpaste_edit: "Edit Paste",
  });
}
