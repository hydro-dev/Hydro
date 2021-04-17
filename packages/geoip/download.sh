#!/bin/bash

if [ ! -f "./GeoLite2-City.mmdb" ]; then
  if [ -n "${LICENSE_KEY}" ]; then
    wget -O ./GeoLite2-City.tar.gz "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=${LICENSE_KEY}&suffix=tar.gz"
    tar zxvf ./GeoLite2-City.tar.gz -C .
    mv ./GeoLite2-City_*/GeoLite2-City.mmdb ./GeoLite2-City.mmdb
    rm -r ./GeoLite2-City_* ./GeoLite2-City.tar.gz
  fi
fi
