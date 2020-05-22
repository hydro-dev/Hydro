const { GridFSBucket } = require('mongodb');
const db = require('./db');

if (!db.s) db.s = {};

global.Hydro.service.gridfs = module.exports = new GridFSBucket(db);
