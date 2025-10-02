#!/bin/bash
if [ $EUID != 0 ]; then
    echo "This script requires root however you are currently running under another user."
    echo "We will call sudo directly for you."
    echo "Please input your account password below:"
    echo "安装脚本需要使用 root 权限，请在下方输入此账号的密码确认授权："
    sudo "$0" "$@"
    exit $?
fi
set -e
echo "Executing Hydro install script v3.0.1"
echo "Hydro includes system telemetry,
which helps developers figure out the most commonly used operating system and platform.
To disable this feature, checkout our sourcecode."
# Sessions started with `su` will not have updated $USER, need to manually fix everything
actual_user=$(whoami)
if [ "$actual_user" != "$USER" ]; then
export USER=root
export LOGNAME=root
export HOME=/root
export PWD=/root
fi
mkdir -p /data/db /data/file ~/.hydro
bash <(curl https://hydro.ac/nix.sh)
export PATH=$HOME/.nix-profile/bin:$PATH
nix-env -iA nixpkgs.nodejs nixpkgs.coreutils nixpkgs.qrencode
echo "扫码加入QQ群："
echo https://qm.qq.com/cgi-bin/qm/qr\?k\=0aTZfDKURRhPBZVpTYBohYG6P6sxABTw | qrencode -o - -m 2 -t UTF8
echo "// File created by Hydro install script\n" >/tmp/install.js
cat >/tmp/install.b64 << EOF123
%PLACEHOLDER%
EOF123
cat /tmp/install.b64 | base64 -d | gunzip >/tmp/install.js
node /tmp/install.js "$@"
set +e
