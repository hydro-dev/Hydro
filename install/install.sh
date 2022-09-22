#!/bin/bash
set -e
echo "Executing Hydro install script v3.0.0"
echo "Hydro includes anonymous system telemetry,
which helps developers figure out the most commonly used operating system and platform.
To disable this feature, checkout our sourcecode."
mkdir -p /data/db /data/file ~/.hydro
bash <(curl https://hydro.ac/nix.sh)
export PATH=$HOME/.nix-profile/bin:$PATH
nix-env -iA nixpkgs.nodejs nixpkgs.pm2 nixpkgs.yarn nixpkgs.esbuild nixpkgs.coreutils nixpkgs.bash nixpkgs.unzip nixpkgs.zip nixpkgs.diffutils nixpkgs.qrencode
echo "扫码加入QQ群："
echo https://qm.qq.com/cgi-bin/qm/qr\?k\=0aTZfDKURRhPBZVpTYBohYG6P6sxABTw | qrencode -o - -m 2 -t UTF8
echo "// File created by Hydro install script\n" >/tmp/install.js
cat >/tmp/install.b64 << EOF123
%PLACEHOLDER%
EOF123
cat /tmp/install.b64 | base64 -d >>/tmp/install.js 
node /tmp/install.js
set +e
