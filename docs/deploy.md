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

Hydro 依赖于 MongoDB 与 NodeJS>=10.10，您应该先安装它们。 

- 下载安装 MongoDB：[https://www.mongodb.com/try/download/community](https://www.mongodb.com/try/download/community)  
- 使用 nvm 安装 NodeJS：[Linux](https://nvm.sh/) [Windows](https://github.com/coreybutler/nvm-windows)  
- 安装 yarn: `npm install yarn -g`  
- 使用 yarn 安装 Hydro：`yarn global add hydrooj @hydrooj/ui-default`  
- 启动 Hydro：`hydrooj`  

可选项：pm2 守护程序  

```sh
yarn global add pm2 # 安装pm2
pm2 startup # 开机自启
pm2 start hydrooj # 启动 Hydro
pm2 save # 保存
```

注意：单个Hydro实例需要约100MB的运行内存，但在载入时可能需要较多内存（取决于安装的模块数量与大小）  

Hydro 会自行初始化并监听 8888 端口（可使用 `--port=1234` 指定其他端口）。请用浏览器访问并进行相应配置。  
数据库配置完成后，会自动创建 Root 用户。（账号 `Root` ，密码 `rootroot`），请及时修改。  

之后的进阶配置可在 管理 面板进行。

## 附加组件

警告：附加组件对站点所有内容具有完全的访问权限。请不要安装来历不明的组件。  

#### 安装附加组件：

先全局安装所需模块，再向 hydrooj 注册即可。  例：安装 @hydrooj/geoip

```sh
yarn global add @hydrooj/geoip
hydrooj addon add @hydrooj/geoip
```

#### 附加组件列表

Hydro官方目前提供了以下附加组件：

| ID                     | 描述                           | 大小  |
| ---------------------- | ------------------------------ | ----- |
| @hydrooj/ui-default    | Hydro的默认用户界面            | ~10MB |
| @hydrooj/geoip         | GeoIP 支持，用于显示用户登录地 | ~60MB |
| @hydrooj/migrate-vijos | 从vijos4的自动升级工具         | <1MB  |
| @hydrooj/hydrojudge    | 评测组件                       | ~2MB  |

#### 卸载附加组件

```sh
yarn global remove @hydrooj/geoip
hydrooj addon remove @hydrooj/geoip
```

## 杂项

[OAuth 配置](./oauth.md)
