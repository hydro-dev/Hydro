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
```
