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
if [ $EUID != 0 ]; then
    echo "This script requires root however you are currently running under another user."
    echo "Please use 'sudo su' to switch to root user before running this script."
    echo "卸载脚本需要使用 root 权限，请先使用 sudo su 切换到 root 用户后再运行此脚本。"
    # sudo "$0" "$@"
    exit $?
fi
Type 'Yes, do as I say!' (without quotes) below to continue:
输入 'Yes, do as I say!' (不含引号) 继续："
read -p "> " confirm;
if [ "$confirm" != "Yes, do as I say!" ];then
  echo "Aborted."
  exit;
fi
if [ "$actual_user" != "$USER" ]; then
echo "In the current environment, the environmental variable does not belong to root, which can lead to failed uninstallation and strange errors"
echo "在目前环境下，环境变量并不属于 root，这会导致卸载失败以及奇怪的错误"
echo "Try to fix it..."
echo "尝试修复..."
export USER=root
export LOGNAME=root
export HOME=/root
export PWD=/root
echo "This might work"
echo "这可能会奏效"
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
