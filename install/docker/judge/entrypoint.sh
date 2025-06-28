#!/bin/sh

pm2 start sandbox -- -mount-conf /root/.hydro/mount.yaml
pm2-runtime start hydrojudge
