#!/bin/sh

ROOT=/root/.config/hydro

mkdir -p $ROOT

if [ ! -f "$ROOT/judge.yaml" ]; then
    cp /root/judge.yaml $ROOT
fi

pm2 start sandbox
pm2-runtime start hydrojudge
