# Codemate-Core

The core & admin of Codemate.

[Hydro README](README-HYDRO.md), [Hydro Docs](https://docs.hydro.ac).

## Deploy & Start

```bash
git clone https://github.com/codemateDao/codemate-core.git
cd codemate-core
docker-compose up -d
```

The Hydro server will be started at port 8888.

## Create a SuperAdmin Account

```bash
docker exec -it codemate-core-hydro-1 /bin/sh
# Create a user "admin", uid=2
npx hydrooj cli user create admin_email@example.com admin 123456 2
# Gave this user super admin
npx hydrooj cli user setSuperAdmin 2
# Quit the docker shell
exit
```

## FAQ

### Q: 我的Typescript挂了（比如一直重启中）怎么办？

该项目的`tsconfig.json`依赖`postinstall`hook运行`build/prepare.js`来生成，如果你的TS挂了，很可能是该脚本没有正常运行，可以尝试手动运行一次。