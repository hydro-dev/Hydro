# Hydro

![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/hydro-dev/hydro/build.yml?branch=master)
![hydrooj](https://img.shields.io/npm/dm/hydrooj)
![npm](https://img.shields.io/npm/v/hydrooj?label=hydrooj)
![node-current](https://img.shields.io/node/v/hydrooj)
![GitHub contributors](https://img.shields.io/github/contributors/hydro-dev/Hydro)
![GitHub commit activity](https://img.shields.io/github/commit-activity/y/hydro-dev/Hydro)

Hydro 是一个高效的信息学在线测评系统。特点：易于部署（且提供安装脚本），轻量，功能强大且易于扩展。  
我们提供了一套在线服务供用户直接使用或是体验系统功能而无需自行部署安装。  
详情前往 [https://hydro.ac](https://hydro.ac) 查看 [操作指引](https://hydro.ac/discuss/6172ceeed850d38c79ae18f9)  


一键部署脚本（兼容多数主流 Linux 发行版，推荐使用 Ubuntu 22.04，详见下方文档）：

```sh
LANG=zh . <(curl https://hydro.ac/setup.sh)
```

[中文文档](https://hydro.js.org/)  

[English](./README-EN.md)  

如果觉得本项目对你有帮助，不妨点一下右上角的 star 哦（）  
项目的开发与维护需要资金，欢迎[进行捐助](https://pay.undefined.moe) 。  
Hydro 提供收费的功能定制服务，如您需要可与我们联系。  
相关文档若说明的不够详细，请提交 Pull Request 或联系开发组说明。  
bug 和功能建议请在 Issues 提出。  

[在 Gitpod 打开测试环境](https://gitpod.io/#https://github.com/hydro-dev/Hydro)  

## 联系我们

Hydro 用户群：1085853538  
Telegram 群 [@hydrodev](https://t.me/hydrodev)
Telegram [@webpack_exports_undefined](https://t.me/webpack_exports_undefined)  

<details>
<summary><h2>更新日志（点击展开）</h2></summary>

### Hydro 4.9.8 / UI 4.48.11
- core: 修复 strictioi 下的计分板显示问题
- core: 允许普通用户查看比赛讨论
- core: 启动时自动建立静态资源文件夹
- core: 允许使用其他 UI 模块
- judge: 修复文件 IO 题目输出重定向的问题
- core: 不再向 Guest 用户分配 sessionId
- judge: 修复提交答案题

### Hydro 4.9.7 / UI 4.48.10
- ui: websocket: 添加心跳包
- judge: 修复客观题和文件 IO 题提交
- judge: 添加 compile_time_limit 选项
- core: 添加 kotlin 和 pypy3 预设
- ui: scoreboard: 支持自动更新
- core: contest: 封榜后允许管理员查看实时分数
- judge: 支持按题目设置语言时空限制倍率
- install: 支持自动导入 hustoj 数据
- install: 支持指定安装源
- core: 支持从 npmjs 自动安装插件
- core&ui: 漏洞修复
- judge: 设置最低评测优先级
- core: 修复部分赛制下封榜时仍能查看提交列表的问题

### Hydro 4.9.0 / UI 4.48.0
- core: 优化讨论鉴权
- judge: 优化统一回调评测状态回显
- judge: 移除 `processTestdata` 步骤
- judge: 客观题子任务分数回显
- core: 压平测试数据结构
- core: rp: 修复比赛分数
- core&ui: 首次使用 OAuth 时要求设置密码
- ui: 评测设置 UI 升级
- install: 根据系统内存调整 wtCacheSize
- ui: 加载速度优化
- core: 检测域 ID 大小写
- ui: 导航栏域索引
- ui: 支持按权限组过滤作业/比赛
- judge: 将 Javascript 默认解释器设置为 node
- judge: 修复删除未评测完成的题目导致评测队列卡死的问题

### Hydro 4.8.0 / UI 4.47.6
- core: 升级至 mongodb@5
- ui: 评测详情中显示子任务得分
- core: 修复测试数据文件名以空格开头导致操作异常的问题
- dev: 升级 devcontainer 环境
- ui: 优化 IDE 页面布局
- ui: 使用 cordis 进行生命周期管理（移除旧 bus）
- blog: 移动功能到独立的 `@hydrooj/blog` 插件
- core: 支持动态设置
- judge: 性能模式（关闭单点回调）
- ui: 支持为作业设置维护者
- core: 放行提交答案题至提交语言白名单
- import-qduoj: 修复空标签导致无法导入的问题
- ui: 精简 serviceworker 逻辑
- ui: 修复训练计划加入失败的问题
- core: 简化 user 返回字段列表
- core&ui: contest.rule.ioi.strict
- 其他漏洞修复和体验优化

### Hydro 4.7.3 / UI 4.47.3
- core: 修复无输入自测
- core: 修复 endpointForUser 域名不一致导致的 token 无效问题
- core: 移除 isBinaryFile 检查
- core: 修复 allowViewCode 设置
- core: cli: 优先使用 mongosh
- workspace: 提供 `@hydrooj/eslint-config` 包
- 其他漏洞修复和体验优化

### Hydro 4.7.2 / UI 4.47.2
- core: 修复提交答案题
- ui: 修复作业页面编辑与删除操作
- vjudge: 适配 codeforces 新接口
- core: 过滤空 `$set` 操作
- ui: domain_dashboard 页显示域创建者
- judge: 修复 hack
- core: 提交时检查所选语言是否存在

### Hydro 4.7.0 / UI 4.47.0
- core: 支持检测导致启动卡死的问题
- core: 修复特定情况下 rating 信息无法写入的问题
- core: 添加更多 validator 字段类型支持，移除旧版 validator
- core&ui: 支持 CORS
- ui: 支持模块懒加载
- ui: 修复邮箱登录
- ui: 修复站内信显示异常的问题
- vjudge: luogu: 修复登录
- judge: 修复客观题部分题目未答导致评测出错的问题
- core: `ConnectionHandler` 支持 `@subscribe(event)`
- util: 修复 `Message.sendNotification` 格式化异常的问题
- core: 数据库优化
- core: 校验用户头像
- judge: 移除 onDestory 钩子，使用 disposables 替代
- ui: 优化资源加载

### Hydro 4.6.0 / UI 4.46.0
- core&ui: 添加 webauthn 支持
- ui: 修复题解投票
- ui: 优化比赛详情页布局
- ui: 修复快捷搜索中评测记录链接
- core: 添加 `Types.ArrayOf()` 支持
- ui: 修复侧栏预览保存
- core: 添加 CookieDomain 设置
- ui: 修复 dev 模式下页面无限刷新的问题
- vjudge: 提供 BasicFetcher 组件
- core: DomainModel 缓存
- core&ui: 其他漏洞修复

### Hydro 4.5.2 / UI 4.45.1
- core: 添加乐多赛支持
- vjudge: 移除 puppeteer 相关依赖
- judge: 修复客观题未设置答案导致评测结果不返回的问题
- ui: 默认移除首页右侧搜索模块
- ui: 添加站内头像上传模块
- core: 允许比赛创建者查看隐藏的计分板
- core: 讨论更改为按照创建时间排序
- ui: 修复题解投票回显
- core: 修复找回密码链接合成错误的问题
- judge: 修复文件 IO 题目编译输出限制过小的问题
- core: 修复 `%` 作为关键词会导致题目搜索出错的问题
- core: 修复比赛题目列表下方提交记录模块不显示的问题
- ui: 修复讨论区部分表情预设 ID 和实际图像不匹配的问题
- install: 默认设置 vm.swappiness=1 以提高性能
- ui: 允许普通用户在设置了查询条件时按页翻阅评测记录
- ui: 提交记录列表添加取消成绩按钮
- core: 修复特定情况下访问日志无法记录的问题
- workspace: 支持 pnpm
- workspace: 移除 mocha
- core: 支持使用形如 `handler/before/Name#method` 的筛选
- judge: 性能优化
- ui: 评测记录列表点击重测时页面不再刷新

### Hydro 4.5.1 / UI 4.45.0
- ui: 支持全局快捷搜索
- core: problem_list: 支持 limit 参数
- core: 精简默认讨论节点列表
- core: validator: 双汉字也被认为是合法用户名
- judge: objective: 支持多答案题目
- core: problemStat: 忽略已取消成绩的提交
- ui: 修复讨论编辑 Ctrl+Enter 快捷键
- ui: 修复锁定讨论主题功能
- core: 优化作业鉴权设置
- core: 封榜功能修复
- ui: contest: 允许手动管理参赛人员
- ui: contest: 支持赛时广播消息提醒
- ui: 其他漏洞修复和性能优化

### Hydro 4.5.0 / UI 4.44.0
- fps: 修复题目中含空文件导致导入失败的问题
- core: 封禁用户时支持附加理由
- vjudge: codeforces: 跳过无法访问的 1769 和 1772 比赛
- ui: 收藏题目操作不再触发页面刷新
- core: 重测时检查题目配置文件有效性
- core: 退出时自动清理临时文件
- core: 禁止使用 . 作为文件名
- import-qduoj: 跳过不合法的题目
- core: 修复提交答案题的比赛代码导出
- judge: 添加 stdioLimit 项
- ui: 修复 message.FLAG_ALERT 显示
- core: training 可上传文件
- ui: 优化比赛导航栏
- ui: 比赛成绩表支持关注队伍
- core: 允许克隆比赛/作业
- ui: 比赛编辑页面添加功能入口
- core: 支持打星参赛
- core: 整题重测时跳过已取消成绩的提交

### Hydro 4.4.5 / UI 4.43.0
- core: 修复比赛基于 ID 搜索题目的功能
- judge: 修复 testlib 错误信息显示异常的问题
- sandbox: 提高默认 stdio 限制
- core: 修复讨论历史记录异常的问题
- core: 优化每日任务的运行速度
- core: 用户详情页支持显示用户近期参加的比赛/作业
- judge: 将 Bash 添加到预设语言列表
- vjudge: 在 cli 模式下跳过加载
- lsp: 修复了自动补全的提示，可能需要手动更新后生效
- judge: 优化 diff 输出
- install: 默认使用 mongodb uri 作为数据库连接方式
- ui: 在用户背景加载失败时 fallback 到默认背景
- 文件路径更改为大小写敏感。
- 在前端插件中支持使用 `import { ... } from '@hydrooj/ui-default'` 引入内置库。
- `ctx.inject('Notification')` 支持插入多行文本。

### 4.4.3
- core: 优化了比赛计分板页面的性能
- core: 导入用户时支持指定用户所属小组和学校
- core&ui: 其他漏洞修复和性能优化
- 添加了 `UserModel.getListForRender(domainId, uids)` 方法。
- 添加 `IHandler.response.pjax` 属性。

### 4.4.0
- core: 移除了 Problem.assign
- core: 修复了比赛结束后，若题目仍处于隐藏状态，无法查看代码的问题
- ui: 修复了 IE 浏览器端页脚的显示
- judge: 修复 lemon checker 异常退出导致题目计分为 0 的问题
- ui: 优化管理端的 Firefox 兼容性警告
- ui: 优化 fps 题目导入后的显示
- ui: 修复 IE 浏览器显示语言识别的问题
- install: 检测已安装的宝塔环境并抛出不兼容警告
- ui: 优化部分错误提示
- migrate: 性能优化
- vjudge: 修复 Codeforces 提交记录爬取异常的问题
- `ProblemModel.getList()` 移除了 group 参数，后续参数前移
- `cordis` 升级至 2.6

### 4.3.2
- 修复评测详情页面在特定情况下不会即时更新的问题
- 将 testlib spj 的错误返回至用户侧
- 修复题目文件无法从管理员侧预览的问题

### 4.3.1
- 终止对 NodeJS <14 的支持
- ui: api: 更新了 API Workbench
- judge: 移除环境变量中 \r，添加 Python Packages 说明
- ui: 修改了部分推荐链接
- prom-client: 记录 EventEmitter 信息
- core: contest: 支持导出比赛信息为 Ghost 格式
- core: contest: 优化比赛中提交量和通过量的计算
- core: contest: 封榜时显示 Pending 提交
- judge: 修复客观题未设置答案导致评测跳过的问题
- core: 优化 CsrfTokenError 和 DomainNotFoundError 回显
- core: server: 捕获 WebSocket 错误
- core: validator: 修复可以发送空站内消息的问题
- 其他漏洞修复和性能优化
- 在题目详情页中，Scratchpad.store 可从 Window 上公开访问

### 4.3.0
- 安装时自动安装 Caddy 配置反向代理监听 80 端口。
- 支持使用 `hydrooj install <src>` 和 `hydrooj uninstall <name>` 快速管理插件。
- 在 管理域 -> 编辑域资料 处添加了语言选择的自动补全。
- 支持在 OI 赛制下查看自己已提交的代码。
- import-qduoj：支持导入 SPJ 题目。
- fps-importer：适配 FPS 文件 1.4 版本。
- 其他漏洞修复和体验优化。
- 支持使用 `ctx.i18n.load(lang, Record<string, string>)` 加载翻译文件。
- 支持 `ctx.withHandlerClass(name, callback)` 获取类原型。
- prom-client: 支持自定义 ConnectionHandler 上报分类。
- 将 Handler.ctx 移动至 Handler.context，新的 Handler.ctx 为 PluginContext。

</details>

## 开源许可

本项目中的 examples/ install/ packages/ui-default/ 下的内容仅采用 AGPL-3.0 进行授权。
项目其余部分使用双重许可：

1. 您可以在遵守 AGPL-3.0 许可证的前提下免费使用这些代码。  
2. 如确需闭源，您也可以联系我们购买其他授权。

在您部署 Hydro 时，需要保留底部的 `Powered by Hydro` 字样，其中的 `Hydro` 字样需指向 `hydro.js.org/本仓库/fork` 之一的链接。  
若您对源码做出修改/扩展，同样需要以 AGPL-3.0-or-later 开源，您可以以 `Powered by Hydro, Modified by xxx` 格式在页脚注明。  
鉴于 Mirai 处的 [不和谐事件](https://github.com/mamoe/mirai/issues/850) 对此项目做如下声明：

- 项目开源不代表开发者有义务为您提供服务。  
- 您的发言不应该具有攻击性或是不友善倾向。  
- 在提问前请先阅读《提问的智慧》。  
- 若有必要，开发者有权对您停止任何技术支持。  
- 开发组会 **尽可能** 保证用户可以进行平滑升级，但无法保证不在新版本引入影响使用的漏洞，且内部实现可能会在不发布任何通知的情况下进行重命名/修改/删除。  

如果您对以上条目感到不适，建议您停止使用本项目。

## 贡献代码

参照 [CONTRIBUTING.md](CONTRIBUTING.md)

## 鸣谢

排名不分先后，按照链接字典序  

- [Github](https://github.com/) 为 Hydro 提供了代码托管与自动构建。  
- [criyle](https://github.com/criyle) 提供评测沙箱实现。  
- [Vijos](https://github.com/vijos/vj4) 为 Hydro 提供了 UI 框架。  

## Sponsors

- [云斗学院](https://www.yundouxueyuan.com)
