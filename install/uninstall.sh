#!/bin/bash

pm2 stop all
pm2 del all
pm2 unstartup
rm -rf `yarn global dir`
rm -rf /nix
rm -rf /data
