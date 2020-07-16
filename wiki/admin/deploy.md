# Introduction | introduction

为什么使用 Hydro ？

- 安全：使用 cgroup 进行隔离，杜绝卡评测；
- 高效：Hydro 使用了沙箱复用技术，拥有极高的评测效率；
- 扩展：Hydro 支持安装额外模块进行扩展；
- 强大：配合 Judger 模块（或 HydroJudger 独立评测机），可支持 spj，交互题，提交答案题，文件IO等多种特性；
- 简便：提供了多种迁移脚本，可从 Vijos 等快速升级至 Hydro；
- 自定：所有权限节点均可自由设置；
- 社区：Hydro 正在持续维护中；

# Deployment | deployment

Hydro 依赖于 MongoDB 与 NodeJS，您应该先安装它们。 

提示：推荐使用 [nvm](https://nvm.sh/) 安装 NodeJS。  

clone 本项目到一个空文件夹，并进行编译：  

```sh
git clone https://github.com/hydro-dev/Hydro.git
cd Hydro
yarn build:all
node .build/app.js
```

注意：单个Hydro实例需要约100MB的运行内存，但在载入时可能需要较多内存（取决于安装的模块数量与大小）  

Hydro 会自行初始化并监听 8888 端口。请用浏览器访问并进行相应配置。  
数据库配置完成后，会自动创建 Root 用户。（账号 `Root` ，密码 `rootroot`），请及时修改。  

之后的进阶配置可在 管理 面板进行。
