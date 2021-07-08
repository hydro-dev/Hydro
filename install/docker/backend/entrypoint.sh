#!/bin/sh

ROOT=/root/.hydro
mkdir -p $ROOT

if [ ! -f "$ROOT/addon.json" ]; then
    echo '["@hydrooj/ui-default"]' > "$ROOT/addon.json"
fi

if [ ! -f "$ROOT/config.json" ]; then
    # TODO 变成变量
    echo '{"host": "oj-mongo", "port": "27017", "name": "hydro", "username": "", "password": ""}' > "$ROOT/config.json"
fi

if [ ! -f "$ROOT/first" ]; then
    echo "for marking use only!" > "$ROOT/first"
	hydrooj cli system set file.accessKey "$ACCESS_KEY"
    hydrooj cli system set file.secretKey "$SECRET_KEY"
    # TODO 变成变量
    hydrooj cli system set file.endPoint http://oj-minio:9000/

    hydrooj cli user create systemjudge@systemjudge.local root rootroot
    hydrooj cli user setSuperAdmin 2
fi

pm2-runtime start hydrooj
