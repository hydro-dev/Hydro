# Hydro

![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/hydro-dev/hydro/build.yml?branch=master)
![hydrooj](https://img.shields.io/npm/dm/hydrooj)
![npm](https://img.shields.io/npm/v/hydrooj?label=hydrooj)
![node-current](https://img.shields.io/node/v/hydrooj)
![GitHub contributors](https://img.shields.io/github/contributors/hydro-dev/Hydro)
![GitHub commit activity](https://img.shields.io/github/commit-activity/y/hydro-dev/Hydro)

Hydro 是一个高效信息学在线测评系统。易安装，跨平台，多功能，可扩展，有题库。

对于不熟悉 Linux 或是懒得运维的老师，我们也提供了免费开通即用的在线版本，  
详情前往 [https://hydro.ac](https://hydro.ac) 查看 [操作指引](https://hydro.ac/discuss/6172ceeed850d38c79ae18f9)  

将安装命令粘贴到控制台一键安装，安装后注册首个用户自动获得超级管理员权限。  
兼容主流 Linux 发行版，推荐使用 Debian 12，支持 arm64 设备（树莓派等）

```sh
LANG=zh . <(curl https://hydro.ac/setup.sh)
```

[中文文档](https://hydro.js.org/) / [English](./README-EN.md)  

相关文档若说明的不够详细，请提交 Pull Request 或联系开发组说明。  
bug 和功能建议请在 Issues 提出。  

## 系统特点

### 模块化设计，插件系统，功能热插拔

Hydro 设计了一套模块化的插件系统，可以方便地扩展系统功能。  
使用插件系统，可以在修改功能后，仍然保证系统的可升级性。  
Hydro 的所有历史版本均可平滑升级到最新版本。  

插件使用和开发指南，请前往文档 [插件](https://docs.hydro.ac/docs/Hydro/plugins) 和 [开发](https://docs.hydro.ac/docs/Hydro/dev/typescript) 章节。

### 跨平台兼容，数据一键备份/导入

Hydro 支持所有主流的 Linux 发行版，兼容 x86_64 和 arm64 架构设备，且均可一键安装。  
Hydro 可在 树莓派 或是 Apple M1/M2 上正常运行。

使用 `hydrooj backup` 即可备份系统全部数据，使用 `hydrooj restore 文件名` 即可导入备份数据。
整个过程无需手工干预。

### 单系统多空间，不同班级/院校，分开管理

Hydro 提供了单系统多空间支持，可以方便地为不同的班级/年级/院校等创建独立的空间。  
不同空间内除用户外数据默认隔离，且可分配独立管理员，互不干扰。  
题目可跨域复制，在系统内仅占用一份空间。

### 粒度精细的权限系统，灵活调节

Hydro 的权限可以按比赛/作业分配给对应的用户，也可以将用户分组（班级），按组分配权限。
有关权限节点，可以查看 [介绍](https://docs.hydro.ac/docs/Hydro) 下方截图。

### 规模化支持，上千用户无压力，伸缩组秒级自动扩展

Hydro 系统本身是无状态的，这意味着你可以随意增删服务节点，而不会影响系统的正常运行。
评测队列会自动在当前在线的所有评测机间均衡分配。接入弹性伸缩组后，可根据服务器负载情况自动增删评测机。
不像其他系统，Hydro 会管理不同服务器间的测试数据缓存，按需拉取，做到评测机上线即用，无需手动同步数据。

### 全题型支持，跟随时代潮流

Hydro 支持所有题型。无论是传统题型，Special Judge，还是文件输入输出，提交答案题，IO 交互，函数交互，乃至选择填空题等，
Hydro 都有相应的支持。安装相关运行环境后，Hydro 甚至可以做到：

- 调用小海龟画图，与标准图片比对；
- 调用 GPU 进行机器学习模型的评测；

更多的样例可前往 [样例区](https://hydro.ac/d/system_test/) 查看并下载。

### 丰富的题库

Hydro 支持导入常见格式的题库文件，包括 Hydro 通用的 zip 格式，HUSTOJ 导出的 FPS (xml) 格式题目，QDUOJ 导出的压缩包。  
可以在 [Hydro 题库](https://hydro.ac/d/tk/p) 下载免费题库使用。  
Hydro 同时支持 VJudge，这意味着你可以直接在系统内导入其他平台的题目，修改题面后编入自己的作业或比赛，快速搭建自己的题库体系。  
当前支持的平台有：  

- [一本通编程启蒙](https://hydro.ac/ybtbas.zip)：官方提供一本通编程启蒙题库，免费使用，参照压缩包内导入说明。
- [深入浅出程序设计竞赛](https://hydro.ac/srqc.zip)：官方提供洛谷《深入浅出程序设计竞赛(基础篇)》配套题库，免费使用，参照压缩包内导入说明。
- [UOJ](https://uoj.ac)：国内知名 OJ，国家集训队常用；
- [Codeforces](https://codeforces.com)：国外大型竞赛平台，大量高质量题目；
- [洛谷](https://www.luogu.com.cn)：使用此功能需要向洛谷购买授权；
- [HDUOJ](https://acm.hdu.edu.cn)：杭州电子科技大学在线评测系统，其中包含多校训练题；
- [CSGOJ](https://cpc.csgrandeur.cn)：广东省赛与湖南省赛赛题评测平台；
- [SPOJ](https://www.spoj.com)：国内连接很不稳定，不推荐；
- [POJ](https://poj.org)：较为古董，服务器稳定性差；
- [YACS](https://iai.sh.cn)：上海市计算机学会竞赛平台，单账号每日提交有限制；
- HUSTOJ：理论上支持所有 HUSTOJ 驱动的系统，但由于各个系统中 UI 有差异，通常需要手动适配。

### 多赛制支持

Hydro 支持多种赛制，包括 ACM/ICPC 赛制（支持封榜），OI 赛制，IOI 赛制，乐多赛制，以及作业功能。  
在 IOI 和 OI 赛制下，支持订正题目功能，学生在赛后可以在题库中提交对应题目，其分数会在榜单旁边显示。  
在 IOI 和 OI 赛制下，支持灵活时间功能，学生可以在设定的时间范围内，自选 X 小时参赛。  

### 轻松添加其他编程语言

Hydro 的语言设置并非硬编码于系统中，而是使用了配置文件。
只要能写出对应语言的编译命令和运行命令，Hydro 都可以进行判题。

## 联系我们

Email：i@undefined.moe
Telegram [@undefinedmoe](https://t.me/undefinedmoe)  
Hydro 用户群：1085853538  

注：加入用户群请先阅读[《提问的智慧》](https://github.com/ryanhanwu/How-To-Ask-Questions-The-Smart-Way/blob/main/README-zh_CN.md)。  
同时群内可能存在部分令您感到不适或感到冒犯的内容。若对此有顾虑**请勿加群**。

<details>
<summary><h2>更新日志（点击展开）</h2></summary>

## Hydro 5.0.0-beta.14 / UI 4.58.0-beta.15

- core: 修复题目创建页面多语言切换
- ui: 修复比赛题目列表显示
- scoreboard-xcpcio: 内置外榜推送功能
- onsite-toolkit: 优先使用座位号作为 cdp id
- scoreboard-xcpcio: 支持定时刷新
- onsite-toolkit: 支持从 URL 加载头像
- onsite-toolkit: 支持展平的队伍照片目录
- core: 复制题目时同时复制难度
- core&ui: 训练页面题目缺失不影响正常显示
- migrate: add jnoj support

## Hydro 5.0.0-beta.13 / UI 4.58.0-beta.14

- ui: 比赛页面添加打印快捷入口
- ui: 比赛题目列表显示时空限制和提交按钮
- core: 检查题解投票权限
- ui: 修复题目配置页文件操作
- ui: 移除旧的 window.Hydro.util 和 window.Hydro.component 对象
- onsite-toolkit: 添加导入工具
- onsite-toolkit: 添加 submit 和 printfile 支持
- onsite-toolkit: 支持限制通信功能
- core: backup: 速度优化
- ui: 优化超长公式显示
- core&ui: 添加允许所有人邀请的选项 
- ui: 优化题目配置页暗色模式
- scoreboard-xcpcio: 支持注册为默认榜单

## Hydro 5.0.0-beta.12 / UI 4.58.0-beta.12

- framework: 修复 SSE 模式参数识别
- ui: 记忆比赛计分板筛选状态
- ui: 修复封榜后提交记录动态更新
- scoreboard-xcpcio: 实验性榜单缓存支持
- ui: 添加比赛一血提示
- core: 添加 hydrooj diag 快速诊断工具
- ui: 禁用链接自动折叠，复制链接自动转义括号
- ui: 优化资源缓存
- core&ui: 支持题目排序

*Breaking API Changes*
- 升级到 React 19
- 升级到 MongoDB Driver 7
- 移除 blueprint.js, react-query 内置，优化资源大小
- 使用 @mongodb-js/saslprep 替代 saslprep

## Hydro 5.0.0-beta.11 / UI 4.58.0-beta.10

- core&ui: 优化新设置页面
- core: 修复乐多榜单尝试数为负
- ui: 修复内置 qface 表情包链接
- core: 修复编辑题号冲突提示
- ui: 修复题目配置页语言选择
- vjudge: 功能优化
- judge: 稳定性修复
- ui: 修复 css 动态加载
- core: 支持比赛材料上传
- core: 性能和内存占用优化
- core: 重命名 PERM_VIEW_DISPLAYNAME 为 PERM_VIEW_USER_PRIVATE_INFO

## Hydro 5.0.0-beta.9 / UI 4.58.0-beta.9

- core: 修复 OI/IOI 赛制一血计算
- judge: 修复 detail 设置
- core: problems 接口按请求顺序返回
- core: 添加解绑 OAuth 账户支持
- framework: 支持 API namespace
- judge: 优化比较器性能
- core: 检查作业延期规则合法性
- core: 踢出用户时自动标记权限为 Guest
- ui: 删除域增加确认弹框
- core: 允许重测同一记录覆盖题目状态

## Hydro 5.0.0-beta.8 / UI 4.58.0-beta.8

- core&ui: 添加比赛打印功能
- core: 允许使用管理员权限直接邀请用户加入域
- vjudge: 支持拉取远端题解
- core: settings: 禁止 displayName 使用特殊 unicode 字符

## Hydro 5.0.0-beta.6 / UI 4.58.0-beta.6

- core: 修复网页端执行脚本返回值
- core: patch: 支持从本地文件读取
- core: 支持复制/导入题目时设置隐藏
- prom-client: 添加连接数指标
- core: 支持基于 restic 增量备份
- ui: 添加 alert/prompt/confirm 函数
- core&ui: 支持复制/导入题目时设置为隐藏
- core: 添加比赛语言限制

## Hydro 5.0.0-beta.3 / UI 4.58.0-beta.3

### New Features

- judge: 添加 checker 编译缓存
- ui: 优化题目详情页面 OGP 信息
- core&ui: 升级 simplewebauthn
- register: 添加 tsdown 支持
- ui&judge: 支持指定 checker 语言
- core: 基于相对时间计算一血而非绝对时间
- ui&judge: 添加栈空间回显
- install: 在树莓派中自动启用 cgroup.memory
- install: 添加 shm 空间大小警告
- core: 升级到 cordis@4
- framework: 支持同时启用多个 renderer
- core: 分离 HMR 和 Watcher 组件
- core: i18n: 添加 interface 选项
- judge: 添加 kattis checker 支持
- core: Settings: 支持使用 Schemastery
- ui: 更新系统设置页面样式
- core: 支持存储并显示提交记录重测历史
- core: 新的加域逻辑
- ui: UserSelect.Multi: 支持批量粘贴用户名
- core: oauth: 支持绑定/解绑三方平台账户 (#971)
- core: 优化 icpc 题目包导入 (#966)
- judge: 弃用 diff (#965)
- core: 支持设置加域时自动加入小组
- core: 添加 `--disable-worker` 启动选项
- ui: 支持使用自定义字体
- framework&core: 重构 Subscription API
- core: 添加 fixStorage 脚本
- ui: 允许跨页选择题目，支持批量选择题目
- judge: 重构 config.detail 设置
- core: 自动清理多余的静态文件
- ui: 优化比赛题目列表显示
- core: 添加比赛补题模式

### Bug Fixes

- migrate: 修复 hustoj 自动运行
- import-qduoj: 修复 spj=null
- core: 修复文件复制
- ui: 修复在线 IDE 右键菜单
- ui: 修复未登录用户查看题目文件页
- ui: 修复暗色模式表格边框 (#968)
- ui: 修复题解回复编辑权限
- ui: 修复高亮行号显示
- core: 修复 `User.serialize()` 参数
- ui: 修复更换邮箱功能
- ui: 修复比赛侧栏
- ui: 修复文档链接

### Breaking API Changes

- vjudge: 使用 vjudge.mount 表替代 domain.mount
- judge: breaking: 不再支持在 checker 等的编译阶段读取选手代码
- core: 强制要求使用 inject 声明插件依赖
- core: 移除旧版本 bus 调用
- core: 移除 global.Hydro.service
- core: 移除 global.Hydro.ui.template
- core: 移除 global.Hydro.lib
- core: 移除 String.prototype.translate (使用 ctx.i18n.translate)
- core: 升级至 Mongo Driver 6
- core: 移除 registerResolver, registerValue, registerUnion (使用 ctx.api.resolver/...)
- core: 移除 paginate, rank (使用 ctx.db.paginate, ctx.db.ranked)
- core: 移除 setting.yaml
- core: oauth: 改为使用 ctx.oauth.provide() 注册
- framework: 移除 ready 与 dispose 事件 (使用 ctx.effect 代替)
- core: 最低要求 node 22
- core: 弃用 AdmZip
- utils: 移除 String.random 与 Array.isDiff

## Hydro 4.19.0 / UI 4.57.0

- core&ui&judge: 添加通信题支持
- core: 优化语言列表筛选
- ui: builder: 支持 css 引入
- ui: 优化客观题题目导航样式
- ui: 在引用题目中添加显示来源按钮
- core: problem.export: 将 pidFilter 参数标记为可选
- onsite-toolkit: resolver: 区分打星队伍
- judge: 文件上传出错时重试
- framework: 文件自动回收
- core: DomainEdit: 添加 boolean 设置项支持
- ui: contest_boolean: 修复默认值
- ui: 修复排名分页
- core: RecordConnection: 支持 noTemplate 选项

## Hydro 4.18.2 / UI 4.56.2

- core: 修复提交答案题压缩包提交 (#917)
- ui: 优化 domain_user 页面性能
- core: 优化评测任务调度
- ui: 下载文件失败时自动重试
- core: Consumer: 从错误中自动恢复

## Hydro 4.18.0 / UI 4.56.0

- core&ui: ScoreboardView API
- onsite-toolkit: Resolver
- core: 优化 icpc 格式导入
- core: 添加 limit.pretest 选项
- core: 添加 task/daily 性能日志
- framework: 默认移除 UiContext 和 UserContext

## Hydro 4.17.4 / UI 4.55.3

- core: 修复 markdown 模式下使用 HTML 导入时解析异常
- core: 允许复制引用的题目
- core&judge: 添加 trusted 选项
- core: 修复导入用户 metadata 解析
- core: 修改 pid 校验格式
- ui: 禁用自动播放
- core: 题目列表性能优化

## Hydro 4.17.3 / UI 4.55.2

- core: 限制显示名长度
- core: 支持调整代码长度限制
- core: 在作业中关闭在线 IDE 代码缓存
- core: API: 检查 PERM_VIEW
- judge: 添加 HYDRO_TIME_USAGE 和 HYDRO_MEMORY_USAGE 环境变量
- core&ui: 支持 i18n 热重载
- fps-import: 优化图片导入
- ui: 支持圆角设置
- core: 支持 StorageModel.copy 和 StorageModel.exists
- core: 弃用 ProblemModel.list
- core: 添加 user/import/parse 和 user/import/create 钩子

## Hydro 4.16.0 / UI 4.54.3

- core: 停用 handler, lib, script 组件类型
- core: 升级到 ts5.6, cordis3.18
- recaptcha: 移除
- core: 大幅提升每日任务性能
- core: (部分)支持 icpc package format
- core: limitRate: 支持自定义 id
- core: 弃用 array 格式题面
- core: backup: 添加 `--withAddons` 选项 (测试)
- core: session 性能优化
- install: mongodb 默认监听 127.0.0.1
- core&ui: 其他错误修复

## UI 4.54.2

- ui: 修复 markdown 预览
- ui: 优化禁用内置登录时的登录框显示

## UI 4.54.1

- ui: 修复 view-transitions
- onlyoffice: 支持处理 PDF 文件
- ui: markdown 支持显示代码行号
- ui: 支持扩展 richmedia 功能
- ui: 支持嵌入优酷视频
- ui: 移除部分页面组件多余的横向滚动条

### Hydro 4.15.0 / UI 4.54.0

- core: 修复题解投票数量计算
- ui: 优化暗色模式 404 页图片
- ui: 点击展开编译信息
- ui: 修复比赛计分板关注用户
- core: ProblemModel.import: 支持 delSource 选项
- ui: 修复生成测试数据实时推送
- prom-client: 上报状态至控制台
- core: oauth: 支持固定用户名
- utils: 支持查找 nix 安装的 pm2
- ui: 优化比赛页题目导航
- ui: 弃用 monacoTheme 选项
- ui: markdown 编辑器支持暗色模式
- framework: 优化堆栈追踪
- core: oplog: 记录访问路径
- migrate: 加长超时时间
- vjudge: 修复 yacs 导致系统崩溃的问题
- sonic: 支持按题目 ID 搜索题目
- core: 修复导入用户时若含小组会覆盖原有小组设置的问题

### Hydro 4.14.1 / UI 4.53.2
- core: 修复分数泄露
- core: 优化错误堆栈
- core: UserModel.getListForRender: 支持额外字段
- core: ProblemModel.import: 合并参数为导入选项
- ui: 启用 view-transistions

### Hydro 4.14.0 / UI 4.53.1
- core: 修复能够越权查看隐藏题目的问题 [security]
- ui: 优化提交记录详情富文本展示
- ui: 支持头像缓存
- ui: 禁止文本越界显示
- vjudge: codeforces: 优化提交 ID 获取
- ui: 默认禁用 sentry
- core: 支持隐藏训练左侧用户栏
- core: cli: 支持 eval
- ui: 添加实验性 speculation rules 支持
- core: 修复训练参加人数计数

### Hydro 4.13.4 / UI 4.52.3
- framework: 修复 404 返回页
- ui: 优化用户权限页布局
- vjudge: codeforces: 优化 katex 显示
- core: cli: 修复 script 加载顺序
- install: 默认禁用 yarn 更新检查
- core: 添加 contest/edit 和 contest/del 钩子
- ui: 支持展开测试点详情
- core: 修复 IOI 赛制封榜
- core: 修复缓存文件不会删除的问题
- core: 导入题目时显示进度
- ui: 修复含空格标签的筛选

### Hydro 4.13.2 / UI 4.52.0
- a11y: 优化网页测性能测试输出顺序
- ui: 使用新 markdown 编辑器
- core: 优化计分板逻辑
- ui: 将缓存移至 IndexedDB
- core: 转写 migration 为服务
- ui: 优化 safari 浏览器兼容
- core: 修复题目 maintainer 字段
- judge: 支持 pretest 中使用文件 IO
- vjudge: codeforces: 添加检查是否提交成功

### Hydro 4.13.0 / UI 4.51.0
- ui: 添加 sentry
- core&ui: 支持显示当前编译器版本
- core: 数据库索引优化
- core: 文件复制使用软链接
- a11y: 添加性能测试工具
- utils: 支持识别大写文件扩展名
- ui: 优化下拉菜单样式
- core: 优化页面标题
- register: 支持从文件读取原 sourcemap
- ui: 修复站内消息推送
- ui: ranking 页面添加说明
- ui: 添加生成测试数据提示
- framework: 从 core 解离
- core: loader: 支持多 profile 切换
- ui: 修复比赛计分板选手组显示
- core: 重设比赛分数时自动重算分数

本版本同时引入下述插件 API 修改：

- 移除了 app/load/${category} 钩子
- 移除了 ctx.app (请使用 ctx.root)
- 移除了 ctx.options (请使用 ctx.root.config)
- serializer: 移除 showDisplayName 参数
- 移除了 loader.addScript, loader.addon 函数
- 移除了 Hydro.module.render (请使用 ctx.server.registerRenderer)
- 移除了 lib/paginate 和 lib/rank (请使用 db.paginate 和 db.ranked)

### Hydro 4.12.3 / UI 4.50.2
- core: 将 API 模块移入 service
- core: 比赛时提交被 hack 不触发整体重测
- core: 将添加 pid match 的逻辑移入搜索中
- ui: 修正 cssFilter
- judge: builtin: 维护 callback 顺序
- core: 优化邮件地址处理
- ui: 显示提交记录长度
- migrate: 支持仅为冲突用户设置随机邮件地址
- core&ui: 支持自动整理 hack 输入
- elastic: 优化模糊搜索
- ui: 修复客观题中多选题载入答案出错的问题
- core: 修复 hack 按钮

### Hydro 4.12.0 / UI 4.50.0
- core: 添加题目统计页
- core: 在记录详情页显示测评进度
- core: problem_list: 允许 hook 修改排序逻辑
- migrate: 添加 poj 支持
- core: api: 支持查询 rpInfo 与 avatarUrl
- ui: 允许禁用 timeago
- core: 修复 IOI(strict) 下取消成绩
- ui: 比赛计分板中高亮自己与关注的用户
- core: 修正比赛榜单 AC 量计算
- core: 禁止重测自测提交
- ui: 优化讨论编辑历史显示
- core: 登录/注册后返回当前的 UserContext
- core: 修复比赛计分板导出的 PERM_VIEW_DISPLAYNAME 检查
- ui: 修复 domain_user 选择框的默认值
- ui: 修复客观题加载上次答案
- core: 重置密码时自动禁用 2FA
- core: import: 题目包导入时支持导入题解和标程
- core: 性能优化和漏洞修复

### Hydro 4.11.2 / UI 4.49.8
- core: 支持给比赛题目设置分数倍率 (#765)
- workspace: 升级 ts 版本至 5.4.3
- core: ws: 处理 JSON 解析异常
- core: 允许向作业中上传文件 (#755)
- ui: 在比赛管理页显示赛题的题目标签
- judge: 修复部分情况下客观题返回结果异常的问题 (#770)
- ui: 在 `mdInline` 中禁用部分标签 (#767)
- core: 添加 R 语言和 cpp20 支持
- ui: 在评测记录页显示峰值耗时
- core: 修复比赛管理员无法查看代码的问题 (#764)
- judge: 提供 `hydrojudge terminal` 入口 (#725)
- core: 支持从 `/nix/store` 加载插件
- core: 添加 `contest/list` 钩子
- judge: vj4 支持
- ui: 修复评测设置面板 testlib 选择 (#762)
- fps-importer: 支持设置大小限制
- core: 添加 `PERM_VIEW_RECORD` 权限组 (#753)
- core: 修复未登录可以查看比赛公告的问题 (#756)
- ui: 允许使用 Enter 键提交 2FA (#752)
- core: 优化训练参与成员列表 (#750)
- core&ui: 其他性能优化和漏洞修复

### Hydro 4.11.0 / UI 4.49.6
- core: 升级至 cordis@3
- core: 优化 katex 处理
- core: 添加 monitor/collect 钩子
- judge: 修复 analysis
- judge: 修复独立评测机首次同步测试数据错误的问题
- migrate: 优化 hustoj 导入
- ui: 修复部分区域 katex 错误渲染的问题

### Hydro 4.10.7 / UI 4.49.5
- core: 优化比赛成绩版按照小组筛选
- core: inject -> injectUI
- core: 修复一处内存泄漏
- ui: 支持 `/record?nopush=1`
- judge: 修复错误的测试数据被缓存的问题 (#726)
- judge: 比赛时不显示 `RuntimeError` 详情
- core: 比赛中题目文件跳过 PERM_VIEW_PROBLEM 检查

### Hydro 4.10.5 / UI 4.49.4

- judge: 性能优化 (thanks @criyle)
- utils: 解离 @hydrooj/register
- core: 对客观题禁用测试点数量检查
- core: 登入时切换 sessionId
- core: 优化 require hook
- core: 修复高并发下用户创建失败问题
- prom-client: 支持推送至 pushgateway
- core&ui: 压缩评测列表页 ws 传输
- utils: 优化测试点识别
- ui: 移除 serializer 函数
- core: 添加 SettingService
- fps: 支持 `[md]` 标签
- vjudge: codeforces: 添加频率限制
- migrate: hustoj: 支持 remote_oj 字段
- core: 其他漏洞修复

### Hydro 4.10.3 / UI 4.49.3

- core: 修复返回状态码异常的问题
- core: 同步排名页行为
- install: 不再预装 pascal 编译器
- judge: 处理心跳包
- core: judge: 优化任务分配
- judge: 优化缓存管理
- core: contest_export_ghost: 当队伍不参与排名时导出星号开头的队伍名
- ui: 修复 monaco 粘贴动作
- ui: 支持批量粘贴用户/题号

### Hydro 4.10.0 / UI 4.49.0

新功能：
- core&ui&judge: 支持从网页端生成测试数据
- vjudge: 添加 yacs 支持
- core: 支持 /record?all=1
- core&ui: 在 ACM 赛制下隐藏测试点详情
- onsite-toolkit: 支持基于IP地址登录
- core&ui: 支持在网页端重命名文件
- core&judge: 允许在单个连接中同时分发多个任务

优化与修复：
- core: 优化文件名过滤
- utils: 优化测试数据匹配逻辑
- install: caddy 默认开启压缩
- ui: 补全部分翻译
- install: 默认使用 mongodb6
- core: 提交记录页性能优化
- judge: 更新 testlib 版本
- core: install: 支持 strip
- ui: 升级最低支持目标为 chrome65
- core: 优化搜索题目时显示的题目数量
- core: 修复 0 分提交记录不会显示在乐多赛排行榜的问题
- core: 修复比赛题面中 file:// 替换
- core: discussion: 校验 vnode 输入
- core: 移除默认 mongo connection options
- ui: 错误页回显名称
- ui: 修复未登录时跨域 WebSocket 连接出错的问题
- core: 修复删除域导致 pinnedDomains 重复的问题
- migrate: hustoj: 处理旧版本系统题目无来源字段的问题
- migrate: 修复 UOJ 迁移脚本
- ui: 修复 reactions 组件
- core: 校验 referer
- core: 修复气球发放
- 其他漏洞修复与性能优化

### Hydro 4.9.26 / UI 4.48.26
- core: 修复创建题目设置难度异常的问题
- core: 优化 document 索引
- core&ui: 比赛气球功能
- core&ui: clarification
- core: 修复 webauthn
- import: add HOJ support
- judge: address space limit (beta)
- install: 支持使用环境变量指定安装区域
- ui: 修复登录时用户不存在错误
- core: 修复登录重定向

### Hydro 4.9.25 / UI 4.48.25
- core: 修复忘记密码邮件发送速率限制
- core: 修复比赛讨论
- ui: 修复题目编辑页子算法标签选择
- utils: 修复 input1.txt 测试点识别
- core: 提交列表：不在第一页时禁用实时推送
- judge: 优化 exitcode 识别
- core: 修复比赛题目提交页边栏
- fps-importer: 修复 remote_oj 字段识别
- ui: 修复使用独立 socketUrl 时 cookie 传入
- vjudge: 更新 csgoj 题面爬取
- vjudge: hduoj 支持

### Hydro 4.9.23 / UI 4.48.23
- migrate: hustoj: 导入时忽略不存在的图片
- core: oauth: 使用 OpenID 进行账号关联
- core: 支持根据显示名搜索用户
- core: 支持根据题目难度搜索题目
- ui: 优化首页比赛作业过滤逻辑
- core: 优化测试点识别
- ui: 禁用自测输入的拼写检查

### Hydro 4.9.22 / UI 4.48.22
- ui: 在线IDE：添加设置页面
- core: 导出题目时添加难度信息
- ui: 修复特定情况下 markdown 标签补全出错的问题
- import-qduoj: 检查 pid 合法性
- core: 排序作业列表
- ui: 修复讨论编辑显示
- core: 导出 pwsh 函数
- vjudge: codeforces: 修复比赛 921 爬取异常

### Hydro 4.9.21 / UI 4.48.21
- core: 修复 strictioi 比赛计分
- ui: 修复已参加训练列表显示
- core: 在比赛开始前禁用计分板
- ui: 在添加用户到域的时候隐藏 default 和 guest 选项
- core: 允许管理员筛选所有小组
- ui: 修复语言过滤（#598）
- ui: 修复讨论 reaction

### Hydro 4.9.20 / UI 4.48.20
- vjudge: 修复 Codeforces 提交结果获取
- core: 优化系统自检功能
- vjudge: 支持 detail 设置（#582）
- ui: 禁用视频自动播放
- install: 支持安装时自动从 UOJ 导入数据
- ui: 修复 preferredPrefix 功能异常的问题

### Hydro 4.9.19 / UI 4.48.19
- core: 修复比赛代码导出功能无法处理选手提交的二进制文件的问题
- core: 修复比赛管理显示用户参与排名状态
- core&ui: 支持按小组筛选比赛/作业
- core: 显示 spj 编译超时等详情信息
- core&ui: 导入题目：支持重新整理题号
- core: loader: 添加 git 集成
- install: 添加 k3s 安装样例
- core: 默认仅使用小写文件名
- ui: 在比赛中忽略记住的客观题答案
- core: 移除 langs.domain 选项
- core: 修复修改邮箱后旧邮箱仍被占用的问题
- ui: 部分样式修复

### Hydro 4.9.18 / UI 4.48.18
- ui: 客观题：支持记住上次选择的答案并添加快速跳题
- core: 使用 $HOME/.hydro 存储临时文件
- core: import: 导入时检查 pid 是否合法
- ui: 添加 validAs 相关语言自测支持
- ui: 修复灵活时间模式下比赛进度条显示
- core: 优化导入用户识别
- ui: 记住编辑器字体大小
- core: 支持按标签搜索题目

### Hydro 4.9.17 / UI 4.48.17
- core&ui: 比赛成绩表和训练支持基于组过滤
- judge: 添加并行优先级处理
- core: 为域设置操作添加操作日志
- core: storage: 保存文件时避开 -_ 等字符
- core: 修复评测记录列表页过滤 Waiting 提交不生效的问题
- ui: 修复 Typescript Language Service 工作异常的问题
- ui: 添加域快速导航开关
- core: 添加 PERM_VIEW_HIDDEN_CONTEST 与 PERM_VIEW_HIDDEN_HOMEWORK 权限
- ui: 翻译优化
- core: langs: 添加 validAs 选项
- migrate: 添加 UOJ 支持
- core&ui: 其他漏洞修复和优化

### Hydro 4.9.15 / UI 4.48.15
- ui: 客观题：允许多行答案
- core: 修复 pinnedDomains 无法修改的问题
- install: 调大默认限制
- ui: 优化比赛弹窗通知
- core: 修复比赛选手管理页时间计算
- core: cli: 题目导出时生成默认题目 ID
- core: dump: 支持 --dbOnly 参数
- core: 用户导入: 重复信息检查
- ui: 更改默认版权信息
- core: 支持训练基于置顶等级排序
- ui: 模板热重载

### Hydro 4.9.13 / UI 4.48.13
- fps-import: 支持处理远端评测题目
- vjudge: 添加 VERDICT.WAITING 属性
- ui: 优化测试数据自动识别
- vjudge: 添加一本通编程启蒙支持
- ui: 添加 `problemset/download` 钩子
- ui: 在打印模式下隐藏部分控件
- core: addon create 使用符号链接
- ui: 评测记录页面显示代码行号
- core: 支持从解压的题目文件夹导入题目
- core: setJudge 时添加 PRIV_UNLIMITED_ACCESS

### Hydro 4.9.12 / UI 4.48.12
- core: 修复比赛中讨论不会随比赛删除的问题
- vjudge: codeforces: 更新登陆检查逻辑
- ui: 在题目提交页面显示提示
- core: 更新用户缓存
- core: 强制终止不回应心跳包的 Websocket 连接
- core: 设置导入题目的默认 tag
- core: 默认禁用 Python2
- core: 支持重排序导航栏
- ui: 修复部分情况下进入编辑模式按钮不生效的问题
- core: 添加 hydrooj patch 功能
- core: 允许查看作业中自己的提交
- core: 其他漏洞修复

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

本项目中 framework/ examples/ install/ 下的内容采用 MIT 协议授权，您可自由使用。  
本项目中 packages/ui-default/ 下的内容仅采用 AGPL-3.0 进行授权。  
项目其余部分使用双重许可：

1. 您可以在遵守 AGPL-3.0 许可证和下述附加条款章节的前提下免费使用这些代码：  
2. 如确需闭源，您也可以联系我们购买其他授权。

### 附加条款

基于 AGPL3 协议第七条，您在使用本项目时，需要遵守以下额外条款：

1. 不可移除本项目的版权声明与作者/来源署名；（[AGPL3 7(b)](LICENSE#L356)）
2. 当重分发经修改后的本软件时，需要在软件名或版本号中采用可识别的方式进行注明；（[AGPL3 7(c)](LICENSE#L360)）
3. 除非得到许可，不得以宣传为目的使用作者姓名；（[AGPL3 7(d)](LICENSE#364)）

即：  
在您部署 Hydro 时，需要保留底部的 `Powered by Hydro` 字样，其中的 `Hydro` 字样需指向 `hydro.js.org/本仓库/fork` 之一的链接。  
若您对源码做出修改/扩展，同样需要以 AGPL-3.0-or-later 开源，您可以以 `Powered by Hydro, Modified by xxx` 格式在页脚注明。  

## 贡献代码

参照 [CONTRIBUTING.md](CONTRIBUTING.md)

## 鸣谢

排名不分先后，按照链接字典序  

- [GitHub](https://github.com/) 为 Hydro 提供了代码托管与自动构建。  
- [criyle](https://github.com/criyle) 提供评测沙箱实现。  
- [Vijos](https://github.com/vijos/vj4) 为 Hydro 提供了 UI 框架。  

## Sponsors

- [云斗学院](https://www.yundouxueyuan.com)
