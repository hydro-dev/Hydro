## 首要条件

> [!WARNING]
> docker 安装方式仅适用于可熟练使用 docker-compose 维护容器的用户，并要求您有基础的错误排查能力  
> 该安装模块非官方维护，即不会提供任何技术支持  
> 普通用户请务必使用自动脚本安装，这可大大提高您一次成功的可能性

本文假设您已经安装了 `docker`、`docker-compose`、`git`，**未安装请先安装**。

## 开始安装（请使用 Linux）

1. 请选择磁盘空间富裕的位置，运行下面的命令。

   `git clone https://github.com/hydro-dev/Hydro.git && cd Hydro/install/docker`

2. 启动服务。

   `docker-compose up -d`

在本机制作 docker 镜像耗时可能会比较长。根据网络情况，大约 5 到 30 分钟就可以自动搭建完成，全程无需人工干预。

命令执行完成后运行 `docker ps -a`，当看到所有的容器的状态没有 `Exited (x) xxx` 就代表 OJ 已经启动成功。

## 注意

安装过程中，会默认注册一个 uid 为 2 的测评账号。用户名：`judge`，密码：`examplepassword`。**请务必及时修改密码**。修改该账号密码后，请修改 `judge/judge.yaml` 中的 `password`。否则可能会无法测评。

## 测评机默认编译器

测评机默认安装了以下编译器，如有需要，请自行安装：

1. gcc
2. python3
3. g++
4. fp-compiler
5. openjdk-17-jdk-headless
6. php-cli
7. rustc
8. ghc
9. libjavascriptcoregtk-4.0-bin
10. golang
11. ruby
12. mono-runtime
13. mono-mcs
