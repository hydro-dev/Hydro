const db = require('../service/db.js');

async function run() {
    await db.dropDatabase();
    console.log('Dropped');
}

module.exports = { run };
