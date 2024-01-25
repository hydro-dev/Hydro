#!/bin/bash

clear
echo "
Warning: 
   This will also delete all process managed by pm2,
   and all related data on your machine. 
   Don't blame me if someone sues you for this, your cat dies etc. 
   You are warned.
警告：
   此脚本会删除所有 pm2 托管的进程，并删除所有相关数据。

Type 'Yes, do as I say!' (without quotes) below to continue:
输入 'Yes, do as I say!' (不含引号) 继续："
read -p "> " confirm;
if [ "$confirm" != "Yes, do as I say!" ];then
  echo "Aborted."
  exit;
fi

echo "The script will run in 10 seconds. Press Ctrl+C to cancel."
echo "脚本将在 10 秒后执行。按 Ctrl+C 取消。"
sleep 10
pm2 stop all
pm2 del all
pm2 unstartup

yarn global remove $(yarn global list | grep info | sed 's/^info "\(.*\)@.*".*$/\1/')
rm -rf `yarn global dir`

rm -rf /nix

rm -rf /data
rm -rf ~/.config/hydro
rm -rf ~/.hydro
