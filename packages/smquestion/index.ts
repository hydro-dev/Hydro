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
} from "hydrooj";

export const TYPE_SMQUESTION: 110 = 110;
export interface smquestionDoc {
  docType: 110;
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
    smquestion: typeof smquestionModel;
  }
  interface DocType {
    [TYPE_SMQUESTION]: smquestionDoc;
  }
}

export class smquestionModel {
  static async add(
    owner: number,
    title: string,
    content: string,
    ip?: string
  ): Promise<ObjectId> {
    const payload: Partial<smquestionDoc> = {
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
      TYPE_SMQUESTION,
      null,
      null,
      null,
      _.omit(payload, ["domainId", "content", "owner"])
    );
    payload.docId = res;
    return payload.docId;
  }

  static async get(did: ObjectId): Promise<smquestionDoc> {
    return await DocumentModel.get("system", TYPE_SMQUESTION, did);
  }

  static edit(
    did: ObjectId,
    title: string,
    content: string
  ): Promise<smquestionDoc> {
    const payload = { title, content };
    return DocumentModel.set("system", TYPE_SMQUESTION, did, payload);
  }

  static inc(
    did: ObjectId,
    key: NumberKeys<smquestionDoc>,
    value: number
  ): Promise<smquestionDoc | null> {
    return DocumentModel.inc("system", TYPE_SMQUESTION, did, key, value);
  }

  static del(did: ObjectId): Promise<never> {
    return Promise.all([
      DocumentModel.deleteOne("system", TYPE_SMQUESTION, did),
      DocumentModel.deleteMultiStatus("system", TYPE_SMQUESTION, {
        docId: did,
      }),
    ]) as any;
  }

  static count(query: Filter<smquestionDoc>) {
    return DocumentModel.count("system", TYPE_SMQUESTION, query);
  }

  static getMulti(query: Filter<smquestionDoc> = {}) {
    return DocumentModel.getMulti("system", TYPE_SMQUESTION, query).sort({
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
        TYPE_SMQUESTION,
        did,
        "reply",
        content,
        owner,
        {
          ip,
        }
      ),
      DocumentModel.incAndSet("system", TYPE_SMQUESTION, did, "nReply", 1, {
        updateAt: new Date(),
      }),
    ]);
    return drid;
  }

  static setStar(did: ObjectId, uid: number, star: boolean) {
    return DocumentModel.setStatus("system", TYPE_SMQUESTION, did, uid, {
      star,
    });
  }

  static getStatus(did: ObjectId, uid: number) {
    return DocumentModel.getStatus("system", TYPE_SMQUESTION, did, uid);
  }

  static setStatus(did: ObjectId, uid: number, $set) {
    return DocumentModel.setStatus("system", TYPE_SMQUESTION, did, uid, $set);
  }
}

global.Hydro.model.smquestion = smquestionModel;

class smquestionHandler extends Handler {
  ddoc?: smquestionDoc;

  @param("did", Types.ObjectId, true)
  async _prepare(domainId: string, did: ObjectId) {
    if (did) {
      this.ddoc = await smquestionModel.get(did);
      if (!this.ddoc) throw new DiscussionNotFoundError(domainId, did);
    }
  }
}

class smquestionUserHandler extends smquestionHandler {
  @param("uid", Types.Int)
  @param("page", Types.PositiveInt, true)
  async get(domainId: string, uid: number, page = 1) {
    const [ddocs, dpcount] = await paginate(
      smquestionModel.getMulti({ owner: uid }),
      page,
      10
    );
    const udoc = await UserModel.getById(domainId, uid);
    this.response.template = "smquestion_main.html";
    this.response.body = {
      ddocs,
      dpcount,
      udoc,
      page,
    };
  }
}

class smquestionDetailHandler extends smquestionHandler {
  @param("did", Types.ObjectId)
  async get(domainId: string, did: ObjectId) {
    const dsdoc = this.user.hasPriv(PRIV.PRIV_USER_PROFILE)
      ? await smquestionModel.getStatus(did, this.user._id)
      : null;
    const udoc = await UserModel.getById(domainId, this.ddoc!.owner);
    if (!dsdoc?.view) {
      await Promise.all([
        smquestionModel.inc(did, "views", 1),
        smquestionModel.setStatus(did, this.user._id, { view: true }),
      ]);
    }
    this.response.template = "smquestion_detail.html";
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
    await smquestionModel.setStar(did, this.user._id, true);
    this.back({ star: true });
  }

  @param("did", Types.ObjectId)
  async postUnstar(domainId: string, did: ObjectId) {
    await smquestionModel.setStar(did, this.user._id, false);
    this.back({ star: false });
  }
}

class smquestionEditHandler extends smquestionHandler {
  async get() {
    this.response.template = "smquestion_edit.html";
    this.response.body = { ddoc: this.ddoc };
  }

  @param("title", Types.Title)
  @param("content", Types.Content)
  async postCreate(domainId: string, title: string, content: string) {
    await this.limitRate("add_smquestion", 3600, 60);
    const did = await smquestionModel.add(
      this.user._id,
      title,
      content,
      this.request.ip
    );
    this.response.body = { did };
    this.response.redirect = this.url("smquestion_detail", {
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
      smquestionModel.edit(did, title, content),
      OplogModel.log(this, "smquestion.edit", this.ddoc),
    ]);
    this.response.body = { did };
    this.response.redirect = this.url("smquestion_detail", {
      uid: this.user._id,
      did,
    });
  }

  @param("did", Types.ObjectId)
  async postDelete(domainId: string, did: ObjectId) {
    if (!this.user.own(this.ddoc!)) this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    await Promise.all([
      smquestionModel.del(did),
      OplogModel.log(this, "smquestion.delete", this.ddoc),
    ]);
    this.response.redirect = this.url("smquestion_main", {
      uid: this.ddoc!.owner,
    });
  }
}

export async function apply(ctx: Context) {
  ctx.Route("smquestion_main", "/smquestion/:uid", smquestionUserHandler);
  ctx.Route(
    "smquestion_create",
    "/smquestion/:uid/create",
    smquestionEditHandler,
    PRIV.PRIV_USER_PROFILE
  );
  ctx.Route(
    "smquestion_detail",
    "/smquestion/:uid/:did",
    smquestionDetailHandler
  );
  ctx.Route(
    "smquestion_edit",
    "/smquestion/:uid/:did/edit",
    smquestionEditHandler,
    PRIV.PRIV_USER_PROFILE
  );
  ctx.injectUI(
    "UserDropdown",
    "smquestion_main",
    (h) => ({
      icon: "book",
      displayName: "smquestion",
      uid: h.user._id.toString(),
    }),
    PRIV.PRIV_USER_PROFILE
  );
  ctx.i18n.load("zh", {
    "{0}'s smquestion": "{0} 的提问",
    "Create a smquestion": "新建一个提问",
    smquestion: "提问列表",
    smquestion_detail: "提问详情",
    smquestion_edit: "编辑提问",
    smquestion_main: "提问",
  });
  ctx.i18n.load("en", {
    smquestion_main: "Question",
    smquestion_detail: "Question Detail",
    smquestion_edit: "Edit Question",
  });
}
