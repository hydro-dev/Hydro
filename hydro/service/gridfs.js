const
    { GridFSBucket } = require('mongodb'),
    db = require('./db');
if (!db.s) db.s = {};
module.exports = new GridFSBucket(db);