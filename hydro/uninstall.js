const Mongo = require('mongodb');
const options = require('./options');

async function run() {
    let mongourl = 'mongodb://';
    if (options.db.username) mongourl += `${options.db.username}:${options.db.password}@`;
    mongourl += `${options.db.host}:${options.db.port}/${options.db.name}`;
    const Database = await Mongo.MongoClient.connect(mongourl, {
        useNewUrlParser: true, useUnifiedTopology: true,
    });
    const db = Database.db(options.db.name);
    await db.dropDatabase();
    console.log('Dropped');
    process.exit(0);
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
