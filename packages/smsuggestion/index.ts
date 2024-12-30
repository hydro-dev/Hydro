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

export const TYPE_SMPSUGGESTION: 120 = 120;
export interface SmsuggestionDoc {
  docType: 120;
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
    smsuggestion: typeof SmsuggestionModel;
  }
  interface DocType {
    [TYPE_SMPSUGGESTION]: SmsuggestionDoc;
  }
}

export class SmsuggestionModel {
  static async add(
    owner: number,
    title: string,
    content: string,
    ip?: string
  ): Promise<ObjectId> {
    const payload: Partial<SmsuggestionDoc> = {
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
      TYPE_SMPSUGGESTION,
      null,
      null,
      null,
      _.omit(payload, ["domainId", "content", "owner"])
    );
    payload.docId = res;
    return payload.docId;
  }

  static async get(did: ObjectId): Promise<SmsuggestionDoc> {
    return await DocumentModel.get("system", TYPE_SMPSUGGESTION, did);
  }

  static edit(
    did: ObjectId,
    title: string,
    content: string
  ): Promise<SmsuggestionDoc> {
    const payload = { title, content };
    return DocumentModel.set("system", TYPE_SMPSUGGESTION, did, payload);
  }

  static inc(
    did: ObjectId,
    key: NumberKeys<SmsuggestionDoc>,
    value: number
  ): Promise<SmsuggestionDoc | null> {
    return DocumentModel.inc("system", TYPE_SMPSUGGESTION, did, key, value);
  }

  static del(did: ObjectId): Promise<never> {
    return Promise.all([
      DocumentModel.deleteOne("system", TYPE_SMPSUGGESTION, did),
      DocumentModel.deleteMultiStatus("system", TYPE_SMPSUGGESTION, {
        docId: did,
      }),
    ]) as any;
  }

  static count(query: Filter<SmsuggestionDoc>) {
    return DocumentModel.count("system", TYPE_SMPSUGGESTION, query);
  }

  static getMulti(query: Filter<SmsuggestionDoc> = {}) {
    return DocumentModel.getMulti("system", TYPE_SMPSUGGESTION, query).sort({
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
        TYPE_SMPSUGGESTION,
        did,
        "reply",
        content,
        owner,
        {
          ip,
        }
      ),
      DocumentModel.incAndSet("system", TYPE_SMPSUGGESTION, did, "nReply", 1, {
        updateAt: new Date(),
      }),
    ]);
    return drid;
  }

  static setStar(did: ObjectId, uid: number, star: boolean) {
    return DocumentModel.setStatus("system", TYPE_SMPSUGGESTION, did, uid, {
      star,
    });
  }

  static getStatus(did: ObjectId, uid: number) {
    return DocumentModel.getStatus("system", TYPE_SMPSUGGESTION, did, uid);
  }

  static setStatus(did: ObjectId, uid: number, $set) {
    return DocumentModel.setStatus(
      "system",
      TYPE_SMPSUGGESTION,
      did,
      uid,
      $set
    );
  }
}

global.Hydro.model.smsuggestion = SmsuggestionModel;

class smsuggestionHandler extends Handler {
  ddoc?: SmsuggestionDoc;

  @param("did", Types.ObjectId, true)
  async _prepare(domainId: string, did: ObjectId) {
    if (did) {
      this.ddoc = await SmsuggestionModel.get(did);
      if (!this.ddoc) throw new DiscussionNotFoundError(domainId, did);
    }
  }
}

class smsuggestionUserHandler extends smsuggestionHandler {
  @param("uid", Types.Int)
  @param("page", Types.PositiveInt, true)
  async get(domainId: string, uid: number, page = 1) {
    const [ddocs, dpcount] = await paginate(
      SmsuggestionModel.getMulti({ owner: uid }),
      page,
      10
    );
    const udoc = await UserModel.getById(domainId, uid);
    this.response.template = "smsuggestion_main.html";
    this.response.body = {
      ddocs,
      dpcount,
      udoc,
      page,
    };
  }
}

class smsuggestionDetailHandler extends smsuggestionHandler {
  @param("did", Types.ObjectId)
  async get(domainId: string, did: ObjectId) {
    const dsdoc = this.user.hasPriv(PRIV.PRIV_USER_PROFILE)
      ? await SmsuggestionModel.getStatus(did, this.user._id)
      : null;
    const udoc = await UserModel.getById(domainId, this.ddoc!.owner);
    if (!dsdoc?.view) {
      await Promise.all([
        SmsuggestionModel.inc(did, "views", 1),
        SmsuggestionModel.setStatus(did, this.user._id, { view: true }),
      ]);
    }
    this.response.template = "smsuggestion_detail.html";
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
    await SmsuggestionModel.setStar(did, this.user._id, true);
    this.back({ star: true });
  }

  @param("did", Types.ObjectId)
  async postUnstar(domainId: string, did: ObjectId) {
    await SmsuggestionModel.setStar(did, this.user._id, false);
    this.back({ star: false });
  }
}

class smsuggestionEditHandler extends smsuggestionHandler {
  async get() {
    this.response.template = "smsuggestion_edit.html";
    this.response.body = { ddoc: this.ddoc };
  }

  @param("title", Types.Title)
  @param("content", Types.Content)
  async postCreate(domainId: string, title: string, content: string) {
    await this.limitRate("add_smsuggestion", 3600, 60);
    const did = await SmsuggestionModel.add(
      this.user._id,
      title,
      content,
      this.request.ip
    );
    this.response.body = { did };
    this.response.redirect = this.url("smsuggestion_detail", {
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
      SmsuggestionModel.edit(did, title, content),
      OplogModel.log(this, "smsuggestion.edit", this.ddoc),
    ]);
    this.response.body = { did };
    this.response.redirect = this.url("smsuggestion_detail", {
      uid: this.user._id,
      did,
    });
  }

  @param("did", Types.ObjectId)
  async postDelete(domainId: string, did: ObjectId) {
    if (!this.user.own(this.ddoc!)) this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    await Promise.all([
      SmsuggestionModel.del(did),
      OplogModel.log(this, "smsuggestion.delete", this.ddoc),
    ]);
    this.response.redirect = this.url("smsuggestion_main", {
      uid: this.ddoc!.owner,
    });
  }
}

export async function apply(ctx: Context) {
  ctx.Route("smsuggestion_main", "/smsuggestion/:uid", smsuggestionUserHandler);
  ctx.Route(
    "smsuggestion_create",
    "/smsuggestion/:uid/create",
    smsuggestionEditHandler,
    PRIV.PRIV_USER_PROFILE
  );
  ctx.Route(
    "smsuggestion_detail",
    "/smsuggestion/:uid/:did",
    smsuggestionDetailHandler
  );
  ctx.Route(
    "smsuggestion_edit",
    "/smsuggestion/:uid/:did/edit",
    smsuggestionEditHandler,
    PRIV.PRIV_USER_PROFILE
  );
  ctx.injectUI(
    "UserDropdown",
    "smsuggestion_main",
    (h) => ({
      icon: "copy",
      displayName: "smsuggestion",
      uid: h.user._id.toString(),
    }),
    PRIV.PRIV_USER_PROFILE
  );

  ctx.i18n.load("zh", {
    "{0}'s smsuggestion": "{0} 要建议",
    "Create a smsuggestion": "新建一个建议",
    smsuggestion: "建议",
    smsuggestion_detail: "建议详情",
    smsuggestion_edit: "编辑建议",
    smsuggestion_main: "建议",
  });
  ctx.i18n.load("en", {
    smsuggestion_main: "Suggestion",
    smsuggestion_detail: "Suggestion Detail",
    smsuggestion_edit: "Edit Suggestion",
  });
}
