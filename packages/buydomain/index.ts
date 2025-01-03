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
    
    const ddocs = await DomainModel.getMulti({ hidden: false }).toArray();
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

class DomainExitHandler extends Handler {
  @param("did", Types.String, true)
  async get(domainId: string, did: string) {
    await Promise.all([
      DomainModel.setUserRole(did, this.user._id, "default"),
      OplogModel.log(this, "domain.exit", {}),
    ]);
    this.response.redirect = this.url("home_domain", {
      query: { notification: "Successfully Exited domain." + did },
    });
  }
}

class BuydomainDetailHandler extends Handler {}

class BuydomainPayHandler extends Handler {}

class BuydomainTryHandler extends Handler {}

async function post(domainId: string, code: string) {
  if (this.joinSettings.method === DomainModel.JOIN_METHOD_CODE) {
    if (this.joinSettings.code !== code) {
      throw new InvalidJoinInvitationCodeError(this.domain._id);
    }
  }
  await Promise.all([
    DomainModel.setUserRole(
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

export async function apply(ctx: Context) {
  ctx.Route("buydomain_list", "/buydomain/list", BuydomainListHandler);
  ctx.Route(
    "buydomain_detail",
    "/buydomain/detail/:did/:uid",
    BuydomainDetailHandler
  );
  ctx.Route("buydomain_pay", "/buydomain/pay/:did/:uid", BuydomainPayHandler);
  ctx.Route("buydomain_try", "/buydomain/try/:did/:uid", BuydomainTryHandler);

  ctx.Route(
    "domain_exit",
    "/domain/exit/:did",
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

  // 覆盖
  ctx.withHandlerClass("DomainJoinHandler", (DomainJoinHandler) => {
    // 修改 DomainJoinHandler 中的一个方法
    DomainJoinHandler.prototype.post = post;
  });

  ctx.i18n.load("zh", {
    buydomain_detail: "课程详情",
    buydomain_main: "添加课程",
    buydomain_list: "所有课程",
    "Domain Detail": "详情",
    "Domain Buy": "添加",
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
