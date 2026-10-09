#!/bin/sh

ROOT=/root/.hydro

if [ ! -f "$ROOT/addon.json" ]; then
    echo '["@hydrooj/ui-default"]' > "$ROOT/addon.json"
fi

# Keep dtoj-ui in the addon list on every start, including volumes that
# already have addon.json from an earlier boot.
node <<'EOF'
const fs = require('fs');
const p = '/root/.hydro/addon.json';
let list = [];
try {
    list = JSON.parse(fs.readFileSync(p, 'utf8'));
} catch (e) {
    list = [];
}
if (!Array.isArray(list)) list = [];
if (!list.includes('@hydrooj/ui-default')) list.unshift('@hydrooj/ui-default');
list = list.filter((name) => name !== 'dtoj-ui');
list.push('dtoj-ui');
fs.writeFileSync(p, JSON.stringify(list));
EOF

if [ ! -f "$ROOT/config.json" ]; then
    echo '{"host": "oj-mongo", "port": "27017", "name": "hydro", "username": "", "password": ""}' > "$ROOT/config.json"
fi

if [ ! -f "$ROOT/first" ]; then
    echo "for marking use only!" > "$ROOT/first"

    hydrooj cli user create systemjudge@systemjudge.local judge examplepassword 2
    hydrooj cli user setJudge 2
    hydrooj cli system set server.host 0.0.0.0
fi

pm2-runtime start hydrooj
