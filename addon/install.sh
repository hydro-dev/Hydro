

cp ../packages/hydrooj/src/lib/ui.ts /usr/local/share/.config/yarn/global/node_modules/hydrooj/src/lib/ui.ts -rf
cp ../packages/hydrooj/src/interface.ts /usr/local/share/.config/yarn/global/node_modules/hydrooj/src/interface.ts -rf
cp ../packages/hydrooj/src/model/domain.ts /usr/local/share/.config/yarn/global/node_modules/hydrooj/src/model/domain.ts -rf 
cp ../packages/hydrooj/src/handler/home.ts /usr/local/share/.config/yarn/global/node_modules/hydrooj/src/handler/home.ts -rf 
cp templates/* /root/addon/templates/ -rf
cp locales/* /root/addon/locales/ -rf 
# cp public/* /root/addon/public/ -rf 

pm2 restart hydrooj
