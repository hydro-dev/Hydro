/* eslint-disable */

// https://github.com/andrasq/node-mongoid-js/blob/master/mongoid.js

export function parse(idstring) {
  if (typeof idstring !== 'string') {
    idstring = String(idstring);
  }
  return {
    timestamp: parseInt(idstring.slice( 0,  0+8), 16),
    machineid: parseInt(idstring.slice( 8,  8+6), 16),
    pid:       parseInt(idstring.slice(14, 14+4), 16),
    sequence:  parseInt(idstring.slice(18, 18+6), 16),
  };
}
