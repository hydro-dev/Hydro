# Hydro

Hydro是一个高效的信息学在线测评系统。  
特点： 易于部署，轻量，功能强大。  

Hydro 的界面基于 Vijos 二次开发。

## 使用方式

#### 使用 `docker-compose`（推荐）

// TODO(WIP)

#### 直接部署：

安装mongodb （省略）  
编辑 `config.yaml` ：

```yaml
db:
    host: 127.0.0.1
    port: 27017
    name: hydro
    username: hydro
    password: db.drop();
listen:
    host: 127.0.0.1
    port: 8888
session:
    domain: '*'
```

运行：

```sh
yarn
cd ui
yarn
yarn build:production
cd ..
node hydro/development.js
```

## 鸣谢

排名不分先后，按照链接字典序  

- [Github](https://github.com/) 为 Hydro 提供了代码托管与自动构建。
- [criyle](https://github.com/criyle) 提供评测沙箱实现。
- [Vijos](https://github.com/vijos/vj4) 为 Hydro 提供了UI框架。
- [undefined](https://masnn.io:38443/) 项目主要开发人员。
