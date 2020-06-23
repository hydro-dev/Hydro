# Basic | basic

Hydro 后端使用 NodeJS 编写，前端使用 JQuery + React。
代码风格遵循 airbnb 标准（详见 .eslintrc.js）。

由于模块中不能使用 require() 引入 Hydro 的文件，因此需要从 global.Hydro 中取出需要的模块。  
例： 

```js
const { db } = global.Hydro.service;
const { problem } = global.Hydro.model;
```

# Module | module

## 文件架构

Hydro 的模块由以下几个部分组成：

service: 服务  
script: 脚本  
handler: 访问路由  
lib: 库  
model: 数据库模型  
file: 额外文件  
locale: 多国化  
template: UI 模板  
README.md: 介绍
hydro.json: 声明文件（必须）

## 模块编译

使用 `hydro-build` 进行编译。  
安装：`yarn add hydro-build -D`  
编译：`hydro-build`  
如果命运的齿轮没有出差错，您应该可以找到生成的.hydro文件了。

# Hydro.json | hydro

Hydro.json 是模块的声明文件，格式如下。  

```json
{
    "id": "模块ID",
    "version": "模块版本",
    "description": "模块描述"
}
```

# Handler | handler

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
    Route('/route/:username', CustomHandler);
}

global.Hydro.handler.handlerName = module.exports = apply;
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

# Service | service

通常用于提供与其他程序对接的接口或启动其他外部程序。（如内置的 MongoDB / 外置的沙箱模块等）

# Lib | lib

库文件。通常用于提供一些功能（废话）。

# File | file

file 文件夹下的所有文件将被自动解压到 `$TMPDIR/hydro/模块ID/路径` 的位置（权限755，通常用于启动子进程）。

# Locale | locale

用于提供多国翻译。格式与 Hydro 的 locale 文件夹格式相同。

# Template | template

页面模板，使用 [nunjucks](https://mozilla.github.io/nunjucks/cn/templating.html) 语法。  
传入了 _ 翻译函数与 model 等。

```html
{% set page_name = "page_name" %}
{% extends "layout/basic.html" %}
{% block content %}
<div class="error__container clearfix">
  <div class="error__icon-container">
    <div class="error__twd2"></div>
  </div>
  <div class="error__text-container">
    <h1>{{ _('Oops!') }}</h1>
    <p>{{ _(error.message).format(error.params) }}</p>
    <p>{{ _('Technical Information') }}:</p>
    <p>{{ _('Type') }}: {{ error.code }}</p>
    <p>{{ _('Arguments') }}:
      <ol>
      {% for param in error.params %}
        <li>{{ param }}</li>
      {% endfor %}
      </ol>
    </p>
  </div>
</div>
{% endblock %}
```

<blockquote class="note">请不要覆盖已有模板。</blockquote>

# README.md | readme

项目的说明文件。
