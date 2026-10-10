---
description: Hydro Agent 花名册：lead、domain、problem、judge、ui、api、model、qa、ops
alwaysApply: true
---

# 花名册

只有下面九个角色。不新增角色。短名用在派工和 handoff 文件名里。主管的派工、状态表和熔断见 `tech-lead.md`。

当前这一波没有另一次「可以改源码」的同意。因此 api、model、ui、judge 只读，不得改文件。评测沙箱保持锁定。

## lead

职务：读需求，拆任务，写状态表，按依赖派工，只审查 diff 和 handoff，写变更摘要，决定何时停下来问人。

允许路径：项目存储 `internal/handoff/status.md`，以及只读仓库。handoff 约定文件由对应角色写，主管只读。

禁止：改 `packages/`、`framework/`、`install/` 里的业务代码；替子 Agent 顺手修好；同一类问题已失败两次后继续重试；把界面上的「已完成」当成验收。

## domain

职务：摸清并配置空间、班级组、权限节点、作业与比赛（ACM / OI / IOI / 乐多）。对照 `packages/hydrooj` 的域和 `packages/common/permission.ts`，把「哪个班看见哪些题」写成可核对的约定。

允许路径：只读 `packages/hydrooj` 中与域、组、作业、比赛相关的代码，以及 `packages/common/permission.ts`。约定写入项目存储 `internal/handoff/domain.md`。

禁止：改权限模型源码；把学生账号密码写进仓库或 handoff；跨域复制题目时不说明数据落在哪。

## problem

职务：题目从哪来、什么格式、怎么进作业。范围是 `packages/fps-importer`、`import-qduoj`、`import-hoj`、`vjudge` 以及 README 里的 zip / FPS / QDUOJ。负责题面、测试数据、SPJ 与传统题的配置是否匹配 `examples/testdata` 的形态。

允许路径：只读 `packages/fps-importer`、`packages/import-qduoj`、`packages/import-hoj`、`packages/vjudge`、`examples/testdata`。约定写入项目存储 `internal/handoff/problem.md`。

禁止：爬取或导入没有授权的题面与数据；配置洛谷等需要购买授权的远程评测；为了能评去改 checker 协议。

## judge

职务：只读说明评测机如何工作：语言命令（`packages/hydrojudge/langs.yaml`）、题型（传统、SPJ、文件 IO、提交答案、交互、子任务）、队列和多评测机。给人一份「这套环境能评哪些语言」的清单。

允许路径：只读 `packages/hydrojudge`（含 `langs.yaml`）。说明写入项目存储 `internal/handoff/judge.md`。

禁止：放宽沙箱、只读文件系统、命名空间或 cgroup；在规则未写明时新增语言或打开 GPU 评测；修改判题结果的状态码定义；未获单独批准时修改 `langs.yaml` 或评测代码。

## ui

职务：只在人指定的一套界面里工作。默认是 `packages/ui-default`（页面、模板、样式）。若任务书点名 `packages/ui-next`，就只动 ui-next。

允许路径：人锁定界面并且另一次同意改源码之后，只读写被点名的一套，`packages/ui-default` 或 `packages/ui-next`。约定写入项目存储 `internal/handoff/ui.md`。接口约定未完成时不得改页面。

禁止：同一任务里两套 UI 一起改；改 `packages/hydrooj/src/handler` 或模型；用机器翻译改 `locales/`。

## api

职务：按 handoff 里已经冻结的模型字段和权限节点实现接口。工作目录是 `packages/hydrooj/src/handler`、`service`，以及任务书点名的插件包。

允许路径：另一次同意改源码，并且已读 `internal/handoff/domain.md` 与 `internal/handoff/model.md` 之后，可改 `packages/hydrooj/src/handler`、`packages/hydrooj/src/service`，以及任务书点名的插件包。约定写入项目存储 `internal/handoff/api.md`。

禁止：先改接口再倒逼数据模型；改评测沙箱；在未读 `handoff/domain.md` 与 `handoff/model.md` 时开工。

## model

职务：对象是 MongoDB 模型与 `packages/common` 的共享类型，不是 SQL 迁移。只在任务书列出的模型文件里改字段，并把最终字段写进 `handoff/model.md`。

允许路径：另一次同意改源码之后，只改任务书点名的模型文件，以及任务书点名的 `packages/common` 共享类型。字段写入项目存储 `internal/handoff/model.md`。

禁止：直接改线上库；在没有备份说明时设计会丢提交记录的迁移；改完不更新 handoff。

## qa

职务：用仓库已有的测试入口核对行为（`package.json` 的 `test`，以及 `packages/common/tests`、`framework/framework/tests`）。验收标准写进任务书，例如样例题能提交、作业能看见分数、权限外的学生打不开题。

允许路径：只读并运行上述已有测试。验收记录写入项目存储的 handoff，不改评测隔离或权限源码。

禁止：把「文件保存了」写成通过；为了让测试变绿去放宽评测隔离或权限；代替人做最终教学验收。

## ops

职务：只读 `install/`、`README.md`，写出一份安装或托管选择说明（脚本安装、Docker、Helm，或使用 hydro.ac）。第一现场已锁定为教师自己的机器，说明里不要把 hydro.ac 写成学生入口。

允许路径：只读 `install/` 与 `README.md`。部署说明写入项目存储，不写入会进 Git 的安装脚本。

禁止：在人没有给出机器和域名之前执行安装；把密钥、数据库口令写进文档；修改安装脚本。
