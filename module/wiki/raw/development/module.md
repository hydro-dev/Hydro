# Module

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
