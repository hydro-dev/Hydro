import {
  _,
  Context,
  DomainJoinAlreadyMemberError,
  DomainJoinForbiddenError,
  InvalidJoinInvitationCodeError,
  DocumentModel,
  OplogModel,
  Filter,
  Handler,
  NumberKeys,
  ObjectId,
  paginate,
  param,
  PRIV,
  Types,
  UserModel,
  DomainModel,
} from "hydrooj";

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
}

class BuydomainListHandler extends Handler {
  @param("page", Types.PositiveInt, true)
  async get(page = 1) {
    // const [tddocs, dpcount] = await paginate(
    //   //DomainModel.getMulti({ owner: { $not: { $eq: uid } } }),
    //   DomainModel.getMulti(),
    //   page,
    //   20
    // );
    const ddocs = await DomainModel.getMulti().toArray();
    const dpcount = 0;

    // 过滤掉已经加入的domain， todo...
    this.response.template = "buydomain_list.html";
    this.response.body = {
      ddocs,
      dpcount,
      page,
    };
  }
}

class DomainJoinHandler extends Handler {
  joinSettings: any;
  noCheckPermView = true;

  async prepare() {
    const r = await domain.getRoles(this.domain);
    const roles = r.map((role) => role._id);
    this.joinSettings = domain.getJoinSettings(this.domain, roles);
    if (!this.joinSettings) throw new DomainJoinForbiddenError(this.domain._id);
    if (this.user.role !== "default")
      throw new DomainJoinAlreadyMemberError(this.domain._id, this.user._id);
  }

  @param("code", Types.Content, true)
  async get(domainId: string, code: string) {
    this.response.template = "domain_join.html";
    this.response.body.joinSettings = this.joinSettings;
    this.response.body.code = code;
  }

  @param("code", Types.Content, true)
  async post(domainId: string, code: string) {
    if (this.joinSettings.method === domain.JOIN_METHOD_CODE) {
      if (this.joinSettings.code !== code) {
        throw new InvalidJoinInvitationCodeError(this.domain._id);
      }
    }

    await Promise.all([
      domain.setUserRole(
        this.domain._id,
        this.user._id,
        this.joinSettings.role
      ),
      OplogModel.log(this, "domain.join", {}),
    ]);
    this.response.redirect = this.url("home_domain", {
      query: { notification: "Successfully joined domain." },
    });
  }
}

class DomainExitHandler extends Handler {
  async get(domainId: string) {
    await Promise.all([
      DomainModel.setUserRole(domainId.domainId, this.user._id, "guest"),
      OplogModel.log(this, "domain.exit", {}),
    ]);
    this.response.redirect = this.url("home_domain", {
      query: { notification: "Successfully Exited domain." },
    });
  }
}

class BuydomainDetailHandler extends Handler {}

class BuydomainPayHandler extends Handler {}

class BuydomainTryHandler extends Handler {}

export async function apply(ctx: Context) {
  ctx.Route("buydomain_list", "/buydomain/list", BuydomainListHandler);
  ctx.Route(
    "buydomain_detail",
    "/buydomain/detail/:did/:uid",
    BuydomainDetailHandler
  );
  ctx.Route("buydomain_pay", "/buydomain/pay/:did/:uid", BuydomainPayHandler);
  ctx.Route("buydomain_try", "/buydomain/try/:did/:uid", BuydomainTryHandler);

  // 覆盖
  ctx.Route(
    "domain_join",
    "/domain/join",
    DomainJoinHandler,
    PRIV.PRIV_USER_PROFILE
  );
  ctx.Route(
    "domain_exit",
    "/domain/exit",
    DomainExitHandler,
    PRIV.PRIV_USER_PROFILE
  );

  ctx.injectUI(
    "UserDropdown",
    "buydomain_list",
    (h) => ({
      icon: "copy",
      displayName: "buydomain_list",
      uid: h.user._id.toString(),
    }),
    PRIV.PRIV_USER_PROFILE
  );

  ctx.i18n.load("zh", {
    buydomain_detail: "课程详情",
    buydomain_main: "购买课程",
    buydomain_list: "所有课程",
    "Domain Detail": "详情",
    "Domain Buy": "购买",
    "Domain Try": "试用",
    "Domains List": "课程列表",
  });
  ctx.i18n.load("en", {
    buydomain_main: "Buy Lession",
    buydomain_detail: "Lessions Detail",
    buydomain_list: "All Lessions",
    "Domain Detail": "Detail",
    "Domain Buy": "Buy",
    "Domain Try": "Try",
    "Domains List": "Courses",
  });
}

global.Hydro.model.buydomain = BuydomainModel;
