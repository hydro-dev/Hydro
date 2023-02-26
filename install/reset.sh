pm2 stop mongodb
rm -rf /data/db /data/file
mkdir /data/db /data/file
pm2 start mongod
sleep 3
db_password=$(cat /dev/urandom | head -n 10 | md5sum | head -c 20)
echo "db.createUser({
  user: 'hydro',
  pwd: '$db_password',
  roles: [
    { role: 'readWrite', db: 'hydro' }
  ]
})" >/tmp/createUser.js
mongosh 127.0.0.1:27017/hydro /tmp/createUser.js
echo "{\"host\":\"127.0.0.1\",\"port\":\"27017\",\"name\":\"hydro\",\"username\":\"hydro\",\"password\":\"$db_password\"}" >~/.hydro/config.json
pm2 stop mongod
pm2 del mongod
pm2 start mongodb
pm2 restart all
pm2 save
