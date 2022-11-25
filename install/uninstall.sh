#!/bin/bash

echo "卸载脚本会卸载此服务器所有有关 Hydro 的数据，请您执行前确认是否备份！"

echo "卸载脚本会删除有关 yarn global 目录下所有文件与 pm2 托管的进程，请您知悉！"

sleep 1

read -p "若您确认删除，请输入yes强制执行: " yes;
	if [ "$yes" != "yes" ];then
		echo -e "------------"
		echo "取消执行！"
		exit;
	fi

    echo "3秒后开始执行......"
    sleep 3

    pm2 stop all
    pm2 del all
    pm2 unstartup

    echo "已经删除服务器上所有由 PM2 托管的进程！"

    sleep 2

    rm -rf `yarn global dir`

    echo "已经删除服务器上所有 yarn global 目录下的文件！"

    sleep 2

    rm -rf /nix
    rm -rf /data

    echo "已经卸载所有 Hydro 相关数据！"

    hydrooj

    if [ $? != 0 ]; then
        echo "Hydro 已经成功删除！"
    else
        echo "Hydro 未成功删除！"
fi
