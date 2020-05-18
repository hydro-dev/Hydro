# Handler

通常用于提供页面路由。

例：注册新路由：

```js
const { Handler, Route } = global.Hydro.service.server;
const { user } = global.Hydro.model;
const { PERM_LOGGEDIN } = global.Hydro.permission;

class CustomHandler extends Handler {
    async prepare() {
        this.checkPassword(PERM_LOGGEDIN);
    }

    async get({ username, password }) {
        const udoc = await user.getByUname(username);
        udoc.checkPassword(password);
        this.response.body = { udoc };
    }

    async post() {
        // 当提交表单时会执行该函数
    }

    async postConfirm() {
        // 当提交表单并存在 operation 值为 confirm 时执行。
    }
}

async function apply() {
    Route('/route/:username', module.exports.CustomHandler);
}

global.Hydro.handler.custom = module.exports = { CustomHandler, apply };
```

在路由中定义所有的函数应均为异步函数，支持的函数如下：

_prepare, prepare, get, post, post[Operation], cleanup, _cleanup

具体流程如下：

先执行 _prepare(args) （如果存在）
args 为传入的参数集合（包括 QueryString, Body, Path）中的全部参数，并对以下字段进行了校验：  

|   名称   |     类型      |
| :------: | :-----------: |
| content  |    string     |
|  title   |    string     |
|   uid    |  number(int)  |
| password |    string     |
|   mail   | string(mail)  |
|  uname   |    string     |
|   page   |  number(int)  |
| duration | number(float) |
|   role   |    string     |
|  roles   |   string[]    |
|   pids   |    string     |
|   tid    | bson.ObjectID |
|   rid    | bson.ObjectID |
|   did    | bson.ObjectID |
|   drid   | bson.ObjectID |
|  drrid   | bson.ObjectID |
|   psid   | bson.ObjectID |
|  psrid   | bson.ObjectID |
|  docId   | bson.ObjectID |
| mongoId  | bson.ObjectID |

再执行 prepare(args) （如果存在）  
检查请求类型：

```
为 GET ？  
  -> 执行 get(args)  
为 POST ?  
  -> 执行 post(args)  
  -> 含有 operation 字段？  
       -> 执行 post[Operation]  
```

执行 cleanup()  
执行 _cleanup()  

如果在 this.response.template 指定模板则渲染，否则直接返回 this.response.body 中的内容。  

* 在表单提交时的 operation 字段使用下划线，函数名使用驼峰命名。  

如 `<input type="hidden" name="operation" value="confirm_delete">` 对应 `postConfirmDelete` 函数。

应当提供 `apply` 函数，并与定义的 Handler 一同挂载到 `global.Hydro.handler[模块名]` 位置。  
`apply` 函数将在初始化阶段被调用。  

<blockquote class="note">请在 apply 函数中从 module.exports 引用，因为它们可能需要被其他模块修改。</blockquote>

