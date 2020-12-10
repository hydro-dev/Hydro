# Hydro 附加组件开发

前置条件：NodeJS>10.10  
此教程将以编写剪贴板插件为例进行说明。  

## Step1 初始化项目

在一个空文件夹中运行 `yarn init` 并按照提示填写相关信息。  

```sh
/workspace/hydro-plugin $ yarn init
yarn init v1.22.4
question name (hydro-plugin): @hydrooj/pastebin
question version (1.0.0): 0.0.1
question description: HydroOJ的剪贴板组件
question entry point (index.js): package.json
question repository url: https://github.com/hydro-dev/pastebin.git
question author: undefined <i@undefined.moe>
question license (MIT): MIT
question private:
success Saved package.json
```

## Step2 准备编写组件

分析：剪贴板组件需要以下功能：  

- 与数据库交互来存储/检索相应文档。  
- 提供 /paste/create 路由以创建新文档。  
- 提供 /paste/show/:ID 来查看已创建的文档。  
- 根据用户ID进行鉴权，允许将文档设置为私密以防止他人查看。  

Hydro的推荐架构如下：

- handler.ts: 用于处理路由
- model.ts: 数据库模型
- lib.ts: 不依赖于数据库等的库（如md5函数）
- script.ts: 可能会被用户多次使用到的脚本（如重新计算rp）
- locale/: 翻译文件
- template/: 页面模板
- setting.yaml: 模块所用到的设置，格式在下方说明

## Step3 tsconfig.json

```json
{
    "compilerOptions": {
        "target": "es2019",
        "module": "commonjs",
        "esModuleInterop": true,
        "moduleResolution": "node",
        "declaration": true,
        "sourceMap": true,
        "composite": true,
        "strictBindCallApply": true,
        "experimentalDecorators": true,
        "outDir": ".",
        "rootDir": "."
    },
    "include": [
        "*.ts"
    ],
    "exclude": []
}
```

## Step3 model.js

提示：若不便于使用 import 引入 Hydro 的文件，可以从 global.Hydro 中取出需要的模块。  

```ts
import 'hydrooj';
import * as db from 'hydrooj/dist/service/db';

const coll = db.collection('paste');

interface Paste {
    _id: string,
    owner: number,
    content: string,
    isPrivate: boolean,
}

declare module 'hydrooj' {
    interface Collections {
        paste: Paste,
    }
}

export async function add(userId: number, content: string, isPrivate: boolean): Promise<string> {
    const pasteId = String.random(16); // Hydro提供了此方法，创建一个长度为16的随机字符串
    // 使用 mongodb 为数据库驱动，相关操作参照其文档
    const result = await coll.insertOne({
        _id: pasteId,
        owner: userId,
        content,
        isPrivate,
    });
    return result.insertedId; // 返回插入的文档ID
}

export async function get(pasteId: string): Promise<Paste> {
    return await coll.findOne({ _id: pasteId });
}

// 暴露这些接口
global.Hydro.model.pastebin = { add, get };

```

## Step4 handler.js

在路由中定义所有的函数应均为异步函数，支持的函数有：prepare, get, post, post[Operation], cleanup  
具体流程如下：  

```
先执行 prepare(args) （如果存在）
args 为传入的参数集合（包括 QueryString, Body, Path）中的全部参数，  
再执行 prepare(args) （如果存在）  
检查请求类型：

为 GET ？  
  -> 执行 get(args)  
为 POST ?  
  -> 执行 post(args)  
  -> 含有 operation 字段？  
       -> 执行 post[Operation]  
```

执行 cleanup()  

如果在 this.response.template 指定模板则渲染，否则直接返回 this.response.body 中的内容。  

* 在表单提交时的 operation 字段使用下划线，函数名使用驼峰命名。  

如 `<input type="hidden" name="operation" value="confirm_delete">` 对应 `postConfirmDelete` 函数。

应当提供 `apply` 函数，并与定义的 Handler 一同挂载到 `global.Hydro.handler[模块名]` 位置。  
`apply` 函数将在初始化阶段被调用。  

```ts
import { Route, Handler } from 'hydrooj/dist/service/server';
import { PRIV } from 'hydrooj/dist/model/builtin'; // 内置 Privilege 权限节点
import { isContent } from 'hydrooj/dist/lib/validator'; // 用于检查用户输入是否合法
import { NotFoundError } from 'hydrooj/dist/error';
import * as pastebin from './pastebin'; // 刚刚编写的pastebin模型

// 创建新路由
class PasteCreateHandler extends Handler {
    // Get请求时触发该函数
    async get() {
        // 检查用户是否登录，此处为多余（因为底部注册路由时已声明所需权限）
        // 此方法适用于权限的动态检查
        // this.checkPriv(PRIV.PRIV_USER_PROFILE);
        this.response.template = 'paste_create.html'; // 返回此页面
    }

    // 使用 isContent 检查输入
    @param('content', Types.String, isContent)
    @param('private', Types.Boolean)
    // 从用户提交的表单中取出content和private字段
    // domainId 为固定传入参数
    async post(domainId: string, content: string, private = false) {
        // 在HTML表单提交的多选框中，选中值为 'on'，未选中则为空，需要进行转换
        await pastebin.add(this.user._id, content, !!private);
        // 将用户重定向到创建完成的url
        this.response.redirect = this.url('paste_show', { id: pasteid });
    }
}

class PasteShowHandler extends Handler {
    @param('id', Types.String)
    async get(domainId: string, id: string) {
        const doc = await pastebin.get(id);
        if (!doc) throw new NotFoundError(id);
        if (doc.isPrivate && this.user._id !== doc.owner) {
            throw new PermissionError();
        }
        this.response.body = { doc };
        this.response.template = 'paste_show.html';
    }

    @param('id', Types.String)
    async postDelete(domainId: string, id: string){
        // 当提交表单并存在 operation 值为 delete 时执行。
        // 本例中未实现删除功能，仅作为说明。
    }
}

// Hydro会在服务初始化完成后调用该函数。
export async function apply(){
    // 注册一个名为 paste_create 的路由，匹配 '/paste/create'，
    // 使用PasteCreateHandler处理，访问改路由需要PRIV.PRIV_USER_PROFILE权限
    // 提示：路由匹配基于 path-to-regexp
    Route('paste_create', '/paste/create', PasteCreateHandler, PRIV.PRIV_USER_PROFILE);
    Route('paste_show', '/paste/show/:id', PasteShowHandler);
}

global.Hydro.handler.pastebin = apply;
```

## Step5 template

TODO

## Step6 Locale

用于提供多国翻译。格式与 Hydro 的 locale 文件夹格式相同。  
