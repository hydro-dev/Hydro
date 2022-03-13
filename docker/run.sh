cd root/Hydro
pm2 start "ulimit -s unlimited && sandbox" --name sandbox
pm2-runtime start "yarn start --port=8888" --name hydrooj